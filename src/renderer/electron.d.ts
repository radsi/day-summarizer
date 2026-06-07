import { CaptureConfig, CaptureMeta } from './types';

declare global {
  interface Window {
    electronAPI: {
      startCapture: (config: CaptureConfig) => Promise<void>;
      stopCapture: () => Promise<void>;
      saveCapture: (data: {
        buffer: number[];
        type: string;
        ext: string;
      }) => Promise<CaptureMeta>;
      onDoCapture: (cb: (config: CaptureConfig) => void) => void;
      onCaptureDone: (cb: (meta: CaptureMeta) => void) => void;
      triggerCapture: (config: CaptureConfig) => void;
      removeDoCapture: (cb: (config: CaptureConfig) => void) => void;
      saveMedia: (fileName: string, data: Uint8Array) => Promise<string>;
      getScreenSources: () => Promise<{ id: string; name: string }[]>;
      buildSlideshowVideo: () => Promise<boolean>;
      clearCaptures: () => boolean;
      platform: NodeJS.Platform;
    };
  }
}
