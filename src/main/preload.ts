import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  startCapture: (config: any) => ipcRenderer.invoke('start-capture', config),
  stopCapture: () => ipcRenderer.invoke('stop-capture'),

  onDoCapture: (cb: (config: any) => void) => {
    const listener = (_: any, config: any) => cb(config);
    ipcRenderer.on('do-capture', listener);
    return listener;
  },

  removeDoCapture: (listener: any) =>
    ipcRenderer.removeListener('do-capture', listener),

  saveMedia: (fileName: string, buffer: Uint8Array) =>
    ipcRenderer.invoke('save-media', fileName, Array.from(buffer)),

  getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),
  buildSlideshowVideo: (config: any) =>
    ipcRenderer.invoke('build-slideshow-video', config),
  clearCaptures: () => ipcRenderer.invoke('clear-captures'),
});
