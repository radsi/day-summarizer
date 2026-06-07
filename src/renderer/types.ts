export interface CaptureMeta {
  filename: string;
  filepath: string;
  timestamp: number;
  type: 'screenshot' | 'recording';
}

export interface CaptureConfig {
  captureType: 'screenshot' | 'recording';
  duration: number;
  intervalMinutes: number;
  sourceId?: string;
  endTime?: string;
  captureDesktopAudio: boolean;
  captureMic: boolean;
}
