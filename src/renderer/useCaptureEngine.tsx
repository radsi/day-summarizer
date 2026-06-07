import { useEffect, useRef } from 'react';
import { CaptureMeta, CaptureConfig } from './types';

async function doCapture(config: CaptureConfig): Promise<CaptureMeta> {
  if (config.captureType === 'screenshot') {
    const buffer = await takeScreenshotFromRenderer();
    const filename = `screenshot-${Date.now()}.png`;
    const filepath = await window.electronAPI.saveMedia(filename, buffer);
    return { filename, filepath, timestamp: Date.now(), type: 'screenshot' };
  } else {
    const buffer = await takeRecordingFromRenderer(config);
    const filename = `recording-${Date.now()}.webm`;
    const filepath = await window.electronAPI.saveMedia(filename, buffer);
    return { filename, filepath, timestamp: Date.now(), type: 'recording' };
  }
}

export function useCaptureEngine(
  onCaptureDone: (meta: CaptureMeta) => void,
  onStop?: () => void,
) {
  const onCaptureDoneRef = useRef(onCaptureDone);
  const listenerRef = useRef<any>(null);
  const endTimestampRef = useRef<number | null>(null);
  const onStopRef = useRef(onStop);

  onCaptureDoneRef.current = onCaptureDone;
  onStopRef.current = onStop;

  useEffect(() => {
    const handler = async (config: CaptureConfig) => {
      try {
        if (config.endTime && endTimestampRef.current === null) {
          endTimestampRef.current = parseEndTime(config.endTime);
        }

        const meta = await doCapture(config);
        onCaptureDoneRef.current(meta);

        const shouldStop = await checkEnd(endTimestampRef.current, config);
        if (shouldStop) {
          setTimeout(() => onStopRef.current?.(), 0);

          return;
        }
      } catch (err) {
        console.error('Capture failed:', err);
      }
    };

    listenerRef.current = window.electronAPI.onDoCapture(handler);

    return () => {
      if (listenerRef.current) {
        window.electronAPI.removeDoCapture(listenerRef.current);
      }
      endTimestampRef.current = null;
    };
  }, []);
}
const checkEnd = async (
  endTimestamp: number | null,
  config: any,
): Promise<boolean> => {
  if (!endTimestamp) return false;

  if (Date.now() >= endTimestamp) {
    try {
      window.electronAPI.stopCapture();
      await window.electronAPI.buildSlideshowVideo(config);
    } catch (err) {
      console.error('Error during auto-stop:', err);
    }

    return true;
  }

  return false;
};

function parseEndTime(time: string): number {
  const [h, m] = time.split(':').map(Number);

  const now = new Date();
  const target = new Date();

  target.setHours(h, m, 0, 0);

  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }

  return target.getTime();
}
export async function takeScreenshotFromRenderer(): Promise<Uint8Array> {
  const sources = await window.electronAPI.getScreenSources();

  const source = sources[0];
  if (!source) throw new Error('No screen source');

  const stream = await (navigator.mediaDevices as any).getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: source.id,
      },
    },
  });

  const track = stream.getVideoTracks()[0];

  const imageCapture = new (window as any).ImageCapture(track);
  const bitmap = await imageCapture.grabFrame();

  track.stop();

  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;

  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);

  const blob = await new Promise<Blob>((res) =>
    canvas.toBlob((b) => res(b!), 'image/png'),
  );

  return new Uint8Array(await blob.arrayBuffer());
}

async function takeRecordingFromRenderer(
  config: CaptureConfig,
): Promise<Uint8Array> {
  const sourceId = await window.electronAPI
    .getScreenSources()
    .then((sources) => sources[0]?.id);

  const supportsDesktopAudio =
    config.captureDesktopAudio && window.electronAPI.platform === 'win32';

  const desktopStream = await navigator.mediaDevices.getUserMedia({
    audio: supportsDesktopAudio
      ? ({
          mandatory: {
            chromeMediaSource: 'desktop',
          },
        } as any)
      : false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId,
      },
    } as any,
  });

  let mixedAudioTrack: MediaStreamTrack | null = null;
  let micStream: MediaStream | null = null;

  if (
    config.captureMic ||
    (supportsDesktopAudio && desktopStream.getAudioTracks().length > 0)
  ) {
    const audioContext = new AudioContext();
    const destination = audioContext.createMediaStreamDestination();

    try {
      if (supportsDesktopAudio && desktopStream.getAudioTracks().length > 0) {
        const desktopSource = audioContext.createMediaStreamSource(
          new MediaStream(desktopStream.getAudioTracks()),
        );

        desktopSource.connect(destination);
      }

      if (config.captureMic) {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });

        const micSource = audioContext.createMediaStreamSource(micStream);

        micSource.connect(destination);
      }

      mixedAudioTrack = destination.stream.getAudioTracks()[0] ?? null;
    } finally {
      setTimeout(
        () => {
          audioContext.close().catch(() => {});
        },
        config.duration * 1000 + 1000,
      );
    }
  }

  const finalStream = new MediaStream([
    ...desktopStream.getVideoTracks(),
    ...(mixedAudioTrack ? [mixedAudioTrack] : []),
  ]);

  const chunks: BlobPart[] = [];

  const recorder = new MediaRecorder(finalStream, {
    mimeType: mixedAudioTrack
      ? 'video/webm; codecs=vp8,opus'
      : 'video/webm; codecs=vp8',
  });

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  const stopped = new Promise<Blob>((resolve) => {
    recorder.onstop = () =>
      resolve(
        new Blob(chunks, {
          type: 'video/webm',
        }),
      );
  });

  recorder.start(1000);

  await new Promise((r) => setTimeout(r, config.duration * 1000));

  recorder.stop();

  const blob = await stopped;

  desktopStream.getTracks().forEach((t) => t.stop());
  micStream?.getTracks().forEach((t) => t.stop());
  finalStream.getTracks().forEach((t) => t.stop());

  return new Uint8Array(await blob.arrayBuffer());
}
