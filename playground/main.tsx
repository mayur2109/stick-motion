import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionPlayer } from '../src/react/index.js';
import { createExercise, exercises, exerciseIds, type ExerciseId } from '../src/exercises/index.js';
import { validateMotion, type MotionClip, type Camera } from '../src/index.js';
import type { RawCapture } from '../src/video/types.js';
import './style.css';
function download(data: unknown, name: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function App() {
  const [clip, setClip] = useState<MotionClip>(exercises.squat),
    [camera, setCamera] = useState<Camera>({ view: 'side' }),
    [joints, setJoints] = useState(false),
    [file, setFile] = useState<File>(),
    [url, setUrl] = useState(''),
    [duration, setDuration] = useState(0),
    [start, setStart] = useState(0),
    [end, setEnd] = useState(4),
    [status, setStatus] = useState(''),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [raw, setRaw] = useState<RawCapture>(),
    [threshold, setThreshold] = useState(0.5),
    [side, setSide] = useState<'left' | 'right'>('left'),
    [range, setRange] = useState(1);
  const abort = useRef<AbortController | null>(null),
    reference = useRef<HTMLVideoElement>(null);
  const diagnostics = useMemo(() => validateMotion(clip), [clip]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  useEffect(() => () => abort.current?.abort(), []);
  async function reprocess() {
    if (!raw) return;
    try {
      const { processLandmarks } = await import('../src/video/index.js');
      const result = processLandmarks(raw, { minConfidence: threshold });
      if (!result.diagnostics.valid) throw new Error(result.diagnostics.errors.join('; '));
      setClip(result.clip);
      setCamera({ view: 'captured' });
      setStatus('Reprocessing complete');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  }
  const select = (id: ExerciseId, s = side, r = range) => {
    const c = createExercise(id, { side: s, range: r });
    setClip(c);
    setCamera(c.camera!);
    setRaw(undefined);
  };
  async function extract() {
    if (!file) return;
    abort.current = new AbortController();
    setBusy(true);
    setStatus('Loading local pose model…');
    setProgress(0);
    try {
      const { importVideo } = await import('../src/video/index.js');
      const result = await importVideo(file, {
        start,
        end,
        assetsUrl: '/assets',
        workerUrl: '/assets/worker.js',
        minConfidence: threshold,
        signal: abort.current.signal,
        onCapture: setRaw,
        onProgress: (p) => {
          setProgress(p);
          setStatus('Extracting movement…');
        },
      });
      setRaw(result.raw);
      if (!result.diagnostics.valid) throw new Error(result.diagnostics.errors.join('; '));
      setClip(result.clip);
      setCamera({ view: 'captured' });
      setStatus('Extraction complete');
    } catch (e) {
      setStatus(
        e instanceof Error ? (e.name === 'AbortError' ? 'Import cancelled' : e.message) : String(e),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main>
      <header>
        <a className="brand" href="/">
          ∿ <span>stick motion</span>
        </a>
        <span className="version">OPEN SOURCE · V0.1</span>
        <a href="https://github.com/mayur2109/stick-motion">View source ↗</a>
      </header>
      <section className="intro">
        <p className="eyebrow">THE MOVEMENT LABORATORY</p>
        <h1>
          A little code.
          <br />A full range of motion.
        </h1>
        <p>
          Explore a jointed 3D skeleton, generate complete exercise repetitions, or turn a local
          video into motion you can reuse.
        </p>
        <div className="badges">
          <span>No API keys</span>
          <span>On-device processing</span>
          <span>SVG + JSON + MP4</span>
        </div>
      </section>
      <div className="workspace">
        <section className="preview panel">
          <div className="panel-heading">
            <span className="eyebrow">01 / PREVIEW</span>
            <span className="status-dot">
              {clip.source.type === 'procedural' ? 'Generated from code' : 'Captured movement'}
            </span>
          </div>
          <h2>{clip.name}</h2>
          <MotionPlayer
            key={
              clip.id +
              side +
              range +
              clip.source.type +
              clip.durationMs +
              String(raw?.frames.length)
            }
            clip={clip}
            camera={camera}
            showJoints={joints}
            onTimeChange={(t) => {
              if (
                clip.source.type === 'video' &&
                reference.current &&
                !reference.current.seeking &&
                Math.abs(
                  reference.current.currentTime -
                    (clip.source.processing?.startMs ?? 0) / 1000 -
                    t / 1000,
                ) > 0.06
              )
                reference.current.currentTime =
                  (clip.source.processing?.startMs ?? 0) / 1000 + t / 1000;
            }}
          />
          <div className="view-options">
            <label>
              View{' '}
              <select
                aria-label="Camera view"
                value={camera.view}
                onChange={(e) => setCamera({ view: e.target.value as Camera['view'] })}
              >
                {['front', 'side', 'three-quarter', 'captured'].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={joints}
                onChange={(e) => setJoints(e.target.checked)}
              />{' '}
              Show joints
            </label>
          </div>
        </section>
        <aside>
          <section className="panel">
            <p className="eyebrow">02 / GENERATE</p>
            <h2>Built from movement rules.</h2>
            <label>
              Exercise
              <select
                value={exerciseIds.includes(clip.id as ExerciseId) ? clip.id : ''}
                onChange={(e) => select(e.target.value as ExerciseId)}
              >
                <option value="" disabled>
                  Imported motion
                </option>
                {exerciseIds.map((id) => (
                  <option value={id} key={id}>
                    {exercises[id].name}
                  </option>
                ))}
              </select>
            </label>
            <div className="two">
              <label>
                Side
                <select
                  value={side}
                  onChange={(e) => {
                    const s = e.target.value as 'left' | 'right';
                    setSide(s);
                    if (exerciseIds.includes(clip.id as ExerciseId))
                      select(clip.id as ExerciseId, s);
                  }}
                >
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
              </label>
              <label>
                Movement range
                <select
                  value={range}
                  onChange={(e) => {
                    const r = Number(e.target.value);
                    setRange(r);
                    if (exerciseIds.includes(clip.id as ExerciseId))
                      select(clip.id as ExerciseId, side, r);
                  }}
                >
                  <option value="1">Full recipe</option>
                  <option value="0.75">75%</option>
                  <option value="0.5">50%</option>
                </select>
              </label>
            </div>
            <p className="help">
              Fixed bone lengths. Stable contacts. Every movement is generated by a reusable recipe.
            </p>
          </section>
          <section className="panel">
            <p className="eyebrow">03 / CAPTURE</p>
            <h2>Your video. Your device.</h2>
            <p className="help">
              One visible person, a steady camera, and up to 30 seconds. Video stays in your
              browser.
            </p>
            <label>
              Reference video
              <input
                type="file"
                accept="video/mp4,video/webm"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  abort.current?.abort();
                  setRaw(undefined);
                  setFile(f);
                  setUrl(f ? URL.createObjectURL(f) : '');
                  setDuration(0);
                  setStatus('');
                }}
              />
            </label>
            {url && (
              <video
                ref={reference}
                src={url}
                muted
                playsInline
                controls
                onLoadedMetadata={(e) => {
                  const d = e.currentTarget.duration;
                  setDuration(d);
                  setStart(0);
                  setEnd(Math.min(4, d));
                }}
                onError={() => setStatus('This browser cannot decode the video. Try an H.264 MP4.')}
                aria-label="Reference video preview"
              />
            )}
            <fieldset disabled={busy || !duration}>
              <div className="two">
                <label>
                  Start (seconds)
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={start}
                    onChange={(e) => setStart(Number(e.target.value))}
                  />
                </label>
                <label>
                  End (seconds)
                  <input
                    type="number"
                    min="0"
                    max={duration}
                    step="0.1"
                    value={end}
                    onChange={(e) => setEnd(Number(e.target.value))}
                  />
                </label>
              </div>
              <label>
                Minimum confidence
                <select value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}>
                  <option value="0.5">Standard · 0.5</option>
                  <option value="0.7">Strict · 0.7</option>
                </select>
              </label>
            </fieldset>
            <div className="actions">
              <button
                className="primary"
                disabled={busy || !duration}
                onClick={() => void extract()}
              >
                Extract motion
              </button>
              {busy && <button onClick={() => abort.current?.abort()}>Cancel extraction</button>}
            </div>
            {busy && <progress max="1" value={progress} />}
            <p role="status" aria-label="Import status">
              {status}
            </p>
          </section>
        </aside>
      </div>
      <section className="panel export-panel">
        <div>
          <p className="eyebrow">04 / TAKE IT WITH YOU</p>
          <h2>Motion is data.</h2>
          <p className="help">Export JSON for your application, or use the CLI to render an MP4.</p>
        </div>
        <div className="actions">
          <button
            onClick={() => download(clip, `${clip.id}.motion.json`)}
            disabled={!diagnostics.valid}
          >
            Download motion JSON
          </button>
          <button disabled={!raw || busy} onClick={() => void reprocess()}>
            Reprocess raw capture
          </button>
          <button onClick={() => download(raw, 'raw-capture.json')} disabled={!raw}>
            Download raw capture
          </button>
          <label className="file-button">
            Import motion JSON
            <input
              type="file"
              accept=".json"
              onChange={async (e) => {
                try {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const c = JSON.parse(await f.text());
                  const d = validateMotion(c);
                  if (!d.valid) throw new Error(d.errors.join('; '));
                  setClip(c);
                  setCamera(c.camera ?? { view: 'front' });
                  setRaw(undefined);
                  setStatus('Motion imported');
                } catch (error) {
                  setStatus(error instanceof Error ? error.message : String(error));
                }
              }}
            />
          </label>
        </div>
        <code>npx stick-motion export clip.json --output demo.mp4</code>
      </section>
      <section className="diagnostics">
        <p>{diagnostics.valid ? '✓ Structural checks passed' : diagnostics.errors.join('; ')}</p>
        {diagnostics.warnings.map((w) => (
          <p key={w}>{w}</p>
        ))}
        <p>
          Generated motions are illustrative demonstrations. Structural checks do not certify
          exercise technique.
        </p>
      </section>
      <footer>
        <span>Made of joints, curves, and constraints.</span>
        <span>MIT licensed · No paid services required</span>
      </footer>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
