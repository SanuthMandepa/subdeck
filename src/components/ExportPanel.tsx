import { baseName, burnIn, stopBurn } from '../engine/export/burn';
import { hasWebCodecs, pickMime } from '../engine/export/caps';
import { toSRT, toTranscript, toVTT } from '../lib/subtitles';
import type { ExportEngine } from '../lib/types';
import { download } from '../lib/util';
import { useStore } from '../state/store';
import { Actions, Group, Row, Segmented } from './ui/Controls';
import { Info } from './ui/Info';

const WEBCODECS = hasWebCodecs();

export function ExportPanel() {
  const cues = useStore((s) => s.cues);
  const file = useStore((s) => s.file);
  const ready = useStore((s) => s.ready);
  const recording = useStore((s) => s.recording);
  const prefs = useStore((s) => s.exportPrefs);
  const setPrefs = useStore((s) => s.setExportPrefs);
  const notify = useStore((s) => s.notify);

  const name = baseName(file?.name);
  const need = () => {
    if (cues.length) return true;
    notify('There are no cues to export yet', true);
    return false;
  };

  return (
    <>
      <Group
        title="Subtitle files · instant"
        info={
          <Info label="sidecar subtitles">
            <p>
              Sidecar files leave the original video untouched, and unlike a burn-in they are
              lossless and reversible. Prefer them unless the platform demands burned-in captions.
            </p>
            <p>
              Drop the <code>.srt</code> next to the video with the same name and VLC, Plex and mpv
              pick it up on their own; YouTube and Premiere import them directly.
            </p>
          </Info>
        }
      >
        <Actions>
          <button
            type="button"
            className="btn amber sm"
            onClick={() => need() && download(`${name}.srt`, toSRT(cues), 'text/plain;charset=utf-8')}
          >
            Download .srt
          </button>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => need() && download(`${name}.vtt`, toVTT(cues), 'text/vtt;charset=utf-8')}
          >
            Download .vtt
          </button>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => need() && download(`${name}.txt`, toTranscript(cues), 'text/plain;charset=utf-8')}
          >
            Plain transcript
          </button>
        </Actions>
      </Group>

      <Group
        title="Burn into the video"
        info={
          <Info label="burn-in engines">
            <p>
              <b>Precise</b> steps the video frame by frame and stamps each one, so audio and
              picture <b>cannot drift</b> however slow the machine is. Usually faster than real
              time, the tab can lose focus, and it always writes MP4 (H.264 + AAC).
            </p>
            <p>
              <b>Real-time</b> records a live canvas as it plays, so it takes exactly as long as
              the video and the tab must stay visible. If drawing stutters, frames drop and the
              audio ends up ahead of the picture. Only use it if Precise fails.
            </p>
            <p>{formatNote()}</p>
          </Info>
        }
      >
        <Row label="Engine">
          <Segmented<ExportEngine>
            ariaLabel="Export engine"
            value={prefs.engine}
            onChange={(engine) => {
              if (engine === 'precise' && !WEBCODECS) return notify('This browser has no WebCodecs', true);
              setPrefs({ engine });
            }}
            options={[
              { value: 'precise', label: 'PRECISE', disabled: !WEBCODECS },
              { value: 'realtime', label: 'REAL-TIME' },
            ]}
          />
        </Row>

        <Row label="Resolution">
          <select
            value={prefs.scale}
            onChange={(e) => setPrefs({ scale: Number(e.target.value) })}
            aria-label="Resolution"
          >
            <option value={100}>Original</option>
            <option value={75}>75%</option>
            <option value={50}>50%</option>
          </select>
        </Row>

        <Row label="Frame rate">
          <select
            value={prefs.fps}
            onChange={(e) => setPrefs({ fps: Number(e.target.value) })}
            aria-label="Frame rate"
            disabled={prefs.engine !== 'precise'}
          >
            {[24, 25, 30, 60].map((f) => (
              <option key={f} value={f}>
                {f} fps
              </option>
            ))}
          </select>
        </Row>

        <Row label="Bitrate">
          <select
            value={prefs.bitrate}
            onChange={(e) => setPrefs({ bitrate: Number(e.target.value) })}
            aria-label="Bitrate"
          >
            <option value={16_000_000}>High · 16 Mbps</option>
            <option value={8_000_000}>Standard · 8 Mbps</option>
            <option value={4_000_000}>Light · 4 Mbps</option>
          </select>
        </Row>

        <Actions>
          <button
            type="button"
            className="btn amber sm"
            onClick={() => void burnIn()}
            disabled={!ready || recording}
          >
            ● Burn &amp; download
          </button>
          <button type="button" className="btn red sm" onClick={stopBurn} disabled={!recording}>
            Stop
          </button>
        </Actions>
      </Group>
    </>
  );
}

function formatNote(): string {
  if (WEBCODECS) {
    return 'Frame rate only affects Precise; the real-time recorder always captures at 30 fps.';
  }
  const m = pickMime();
  if (!m) return 'This browser can neither encode nor record video. Sidecar .srt export still works.';
  return `No WebCodecs here, so only the real-time recorder is available — it writes ${
    m.startsWith('video/mp4') ? 'MP4' : 'WebM'
  }. Chrome or Edge would give you the precise encoder.`;
}
