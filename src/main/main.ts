import path from 'path';
import fs from 'fs';
import {
  app,
  BrowserWindow,
  shell,
  ipcMain,
  desktopCapturer,
  Tray,
  Menu,
} from 'electron';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
let captureInterval: NodeJS.Timeout | null = null;

const capturesDir = path.join(app.getPath('userData'), 'captures');
if (!fs.existsSync(capturesDir)) {
  fs.mkdirSync(capturesDir);
}

let currentConfig: any = null;

ipcMain.handle('start-capture', async (event, config) => {
  currentConfig = config;

  if (captureInterval) clearInterval(captureInterval);

  const intervalMs = config.intervalMinutes * 60 * 1000;

  captureInterval = setInterval(() => {
    if (currentConfig) {
      event.sender.send('do-capture', currentConfig);
    }
  }, intervalMs);

  event.sender.send('do-capture', currentConfig);
});

ipcMain.handle('stop-capture', () => {
  if (captureInterval) {
    clearInterval(captureInterval);
    captureInterval = null;
  }
  currentConfig = null;
});

ipcMain.handle('clear-captures', () => {
  const files = fs.readdirSync(capturesDir);
  for (const file of files) {
    const fullPath = path.join(capturesDir, file);
    try {
      fs.unlinkSync(fullPath);
    } catch (err) {
      console.error(`error deleting ${file}:`, err);
      return false;
    }
  }
  return true;
});

ipcMain.handle(
  'save-media',
  async (_event, fileName: string, data: Uint8Array) => {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);

    const filePath = path.join(capturesDir, fileName);
    fs.writeFileSync(filePath, buffer);

    return filePath;
  },
);

ipcMain.handle('get-screen-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
  });

  return sources.map((s) => ({
    id: s.id,
    name: s.name,
  }));
});

ipcMain.handle('build-slideshow-video', async (event, config: any) => {
  const files = fs.readdirSync(capturesDir);

  const sorted = files
    .filter((f) => f.endsWith('.png') || f.endsWith('.webm'))
    .sort((a, b) => {
      const ta = fs.statSync(path.join(capturesDir, a)).mtimeMs;
      const tb = fs.statSync(path.join(capturesDir, b)).mtimeMs;
      return ta - tb;
    });

  const baseDir =
    process.env.DEBUG === 'true'
      ? capturesDir
      : path.dirname(app.getPath('exe'));

  const outputDir = path.join(baseDir, 'slideshows');

  fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, `slideshow-${Date.now()}.webm`);

  const chunks: string[] = [];

  for (const file of sorted) {
    const fullPath = path.join(capturesDir, file).replace(/\\/g, '/');

    if (file.endsWith('.webm')) {
      chunks.push(`file '${fullPath}'`);
    }

    if (file.endsWith('.png')) {
      chunks.push(`file '${fullPath}'`);
      chunks.push(`duration ${config.duration}`);
    }
  }

  const lastFile = sorted[sorted.length - 1];
  if (lastFile?.endsWith('.png')) {
    const lastPath = path.join(capturesDir, lastFile).replace(/\\/g, '/');
    chunks.push(`file '${lastPath}'`);
  }

  const listPath = path.join(capturesDir, 'list.txt');
  fs.writeFileSync(listPath, chunks.join('\n'));

  await new Promise((resolve, reject) => {
    const ffmpeg = require('child_process').spawn('ffmpeg', [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listPath,
      '-vsync',
      'vfr',
      '-pix_fmt',
      'yuv420p',
      outputPath,
    ]);

    ffmpeg.on('close', (code: number) => {
      if (code === 0) resolve(true);
      else reject(new Error(`ffmpeg exited ${code}`));

      if (fs.existsSync(listPath)) {
        fs.unlinkSync(listPath);
      }
    });
  });

  for (const file of sorted) {
    const fullPath = path.join(capturesDir, file);
    try {
      fs.unlinkSync(fullPath);
    } catch (err) {
      console.error(`error deleting ${file}:`, err);
    }
  }

  return {
    filePath: outputPath,
  };
});

let mainWindow: BrowserWindow | null = null;

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug').default();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload,
    )
    .catch(console.log);
};

const RESOURCES_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'assets')
  : path.join(__dirname, '../../assets');

const getAssetPath = (...paths: string[]): string => {
  return path.join(RESOURCES_PATH, ...paths);
};

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  mainWindow = new BrowserWindow({
    show: false,
    width: 1024,
    height: 728,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });
};

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

let tray: Tray | null = null;
let isQuitting = false;

app
  .whenReady()
  .then(() => {
    createWindow();
    app.on('activate', () => {
      if (mainWindow === null) createWindow();
    });
    tray = new Tray(getAssetPath('icon.png'));

    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open', click: () => mainWindow?.show() },
        {
          label: 'Quit',
          click: () => {
            isQuitting = true;
            app.quit();
          },
        },
      ]),
    );

    mainWindow?.on('close', (e) => {
      if (!isQuitting) {
        e.preventDefault();
        mainWindow?.hide();
      }
    });
  })
  .catch(console.log);
