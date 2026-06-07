import { useEffect, useState } from 'react';
import './App.css';
import { useCaptureEngine } from './useCaptureEngine';
import { CaptureMeta, CaptureConfig } from './types';

export const CAPTURE_CAPS = {
  desktopAudio: window.electronAPI.platform === 'win32',
};

function CaptureHistory({ history }: { history: CaptureMeta[] }) {
  return (
    <div className="capture-history">
      <h2>Capture History</h2>
      <div className="capture-history__list">
        {history.length === 0 ? (
          <p className="capture-history__empty">No captures yet.</p>
        ) : (
          history.map((item, index) => (
            <div key={index} className="capture-history__item">
              <strong>{item.type}</strong> —{' '}
              {new Date(item.timestamp).toLocaleString()}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TimerConfiguration({
  config,
  setConfig,
  enabled,
  setEnabled,
  lastCaptureTime,
}: {
  config: CaptureConfig;
  setConfig: React.Dispatch<React.SetStateAction<CaptureConfig>>;
  enabled: boolean;
  setEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  lastCaptureTime: number | null;
}) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled || lastCaptureTime === null) {
      setSecondsLeft(null);
      return;
    }

    const totalSeconds = config.intervalMinutes * 60;

    const tick = () => {
      const elapsed = Math.floor((Date.now() - lastCaptureTime) / 1000);
      const remaining = totalSeconds - elapsed;
      setSecondsLeft(remaining > 0 ? remaining : 0);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [enabled, lastCaptureTime, config.intervalMinutes]);

  function formatTime(seconds: number) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s
        .toString()
        .padStart(2, '0')}`;
    }
    return `${h}:${m}:${s.toString().padStart(2, '0')}`;
  }
  async function handleCaptureTypeChange(type: CaptureConfig['captureType']) {
    setConfig((c) => ({ ...c, captureType: type }));
    if (enabled) {
      await window.electronAPI.stopCapture();
      setEnabled((e) => !e);
    }
  }

  return (
    <div className="timer-config">
      <h2>Timer configuration</h2>

      <div className="timer-config__content">
        <div className="timer-config__section">
          <p className="timer-config__label">Capture type</p>
          <div className="timer-config__type-buttons">
            {['screenshot', 'recording'].map((type) => (
              <button
                key={type}
                type="button"
                onClick={async () =>
                  await handleCaptureTypeChange(
                    type as CaptureConfig['captureType'],
                  )
                }
                className={`timer-config__type-btn ${config.captureType === type ? 'timer-config__type-btn--active' : ''}`}
              >
                {type === 'screenshot' ? '📷' : '🎥'} {type}
              </button>
            ))}
          </div>
        </div>

        <div className="timer-config__section">
          <p className="timer-config__label">
            {config.captureType === 'recording'
              ? 'Recording duration'
              : 'Image duration on slideshow'}
            : <strong>{config.duration}s</strong>
          </p>
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={config.duration}
            onChange={(e) =>
              setConfig((c) => ({ ...c, duration: Number(e.target.value) }))
            }
            className="timer-config__range"
          />
          <div className="timer-config__range-labels">
            <span>1s</span>
            <span>5s</span>
          </div>
        </div>

        {config.captureType === 'recording' && (
          <>
            <div className="timer-config__section timer-config__audio">
              <p className="timer-config__label">Audio sources</p>
              {CAPTURE_CAPS.desktopAudio && (
                <label className="timer-config__checkbox-label">
                  <input
                    type="checkbox"
                    checked={config.captureDesktopAudio}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        captureDesktopAudio: e.target.checked,
                      }))
                    }
                  />
                  🖥️ Desktop audio
                </label>
              )}
              <label className="timer-config__checkbox-label">
                <input
                  type="checkbox"
                  checked={config.captureMic}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, captureMic: e.target.checked }))
                  }
                />
                🎤 Microphone
              </label>
            </div>
          </>
        )}

        <div className="timer-config__section">
          <p className="timer-config__label">
            Capture every: <strong>{config.intervalMinutes} min</strong>
          </p>
          <input
            type="range"
            min={1}
            max={180}
            step={1}
            value={config.intervalMinutes}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                intervalMinutes: Number(e.target.value),
              }))
            }
            className="timer-config__range"
          />
          <div className="timer-config__range-labels">
            <span>1 min</span>
            <span>3 h</span>
          </div>
        </div>

        <div className="timer-config__endtime">
          <div className="timer-config__section">
            <p className="timer-config__sublabel">End of day stop time</p>
            <input
              type="time"
              value={config.endTime || '23:59'}
              onChange={(e) =>
                setConfig((c) => ({ ...c, endTime: e.target.value }))
              }
              className="timer-config__time-input"
            />
          </div>

          {!enabled ? (
            <p className="timer-config__status timer-config__status--stopped">
              Timer stopped
            </p>
          ) : secondsLeft === null ? (
            <p className="timer-config__status">Waiting for first capture...</p>
          ) : (
            <>
              <p className="timer-config__status">Next capture in</p>
              <p className="timer-config__countdown">
                {formatTime(secondsLeft)}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Main() {
  const [enabled, setEnabled] = useState(false);
  const [history, setHistory] = useState<CaptureMeta[]>([]);
  const [config, setConfig] = useState<CaptureConfig>({
    captureType: 'screenshot',
    duration: 3,
    intervalMinutes: 1,
    captureDesktopAudio: true,
    captureMic: false,
  });
  const [lastCaptureTime, setLastCaptureTime] = useState<number | null>(null);

  useCaptureEngine((meta: CaptureMeta) => {
    setHistory((prev) => [meta, ...prev]);
    setLastCaptureTime(Date.now());
  });

  const handleToggle = async () => {
    if (!enabled) {
      await window.electronAPI.startCapture(config);
    } else {
      await window.electronAPI.stopCapture();
      if (history.length > 1) {
        await window.electronAPI.buildSlideshowVideo(config);
      } else {
        window.electronAPI.clearCaptures();
      }

      setHistory([]);
      setLastCaptureTime(null);
    }
    setEnabled((e) => !e);
  };

  return (
    <div className="main">
      <h1>Day Summarizer</h1>
      <button type="button" onClick={handleToggle}>
        {enabled ? '🟢 Enabled' : '🔴 Disabled'}
      </button>
      <div className="main__panels">
        <TimerConfiguration
          config={config}
          setConfig={setConfig}
          enabled={enabled}
          setEnabled={setEnabled}
          lastCaptureTime={lastCaptureTime}
        />
        <CaptureHistory history={history} />
      </div>
    </div>
  );
}
