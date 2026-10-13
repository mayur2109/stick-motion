'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Camera, MotionClip } from '../core/types.js';
import { sampleMotion } from '../core/motion.js';
import { createPlayer } from '../core/player.js';
import { renderSvg, motionViewBox } from '../core/render.js';
export interface MotionPlayerProps {
  clip: MotionClip;
  camera?: Camera;
  showJoints?: boolean;
  autoplay?: boolean;
  controls?: boolean;
  className?: string;
  onTimeChange?: (timeMs: number) => void;
}
export function MotionPlayer({
  clip,
  camera,
  showJoints = false,
  autoplay = false,
  controls = true,
  className = '',
  onTimeChange,
}: MotionPlayerProps) {
  const player = useMemo(() => createPlayer(clip), [clip]);
  const [state, setState] = useState(() => player.getState());
  const container = useRef<HTMLDivElement>(null),
    callback = useRef(onTimeChange);
  callback.current = onTimeChange;
  useEffect(() => {
    if (autoplay && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) player.play();
    setState(player.getState());
    return () => player.pause();
  }, [player, autoplay]);
  useEffect(() => {
    if (!state.playing) return;
    let frame: number;
    const tick = () => {
      const next = player.getState();
      setState(next);
      callback.current?.(next.timeMs);
      if (next.playing) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [player, state.playing]);
  useEffect(() => {
    let resume = false,
      visible = true;
    const sync = () => {
      const hidden = document.hidden || !visible;
      if (hidden) {
        resume = player.getState().playing || resume;
        player.pause();
      } else if (resume) {
        resume = false;
        player.play();
      }
      setState(player.getState());
    };
    document.addEventListener('visibilitychange', sync);
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? undefined
        : new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
            sync();
          });
    if (container.current) observer?.observe(container.current);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      observer?.disconnect();
    };
  }, [player]);
  const act = (fn: () => void) => {
    fn();
    const next = player.getState();
    setState(next);
    callback.current?.(next.timeMs);
  };
  const viewBox = useMemo(
    () => motionViewBox(clip, camera ?? clip.camera),
    [clip, camera?.view, camera?.yaw, camera?.elevation],
  );
  const pose = sampleMotion(clip, Math.min(state.timeMs, clip.durationMs));
  return (
    <div ref={container} className={`stick-motion-player ${className}`}>
      <div
        className="stick-motion-stage"
        style={{
          width: '100%',
          aspectRatio: '1 / 1',
          maxHeight: 520,
          color: 'var(--motion-color, #25324a)',
        }}
        dangerouslySetInnerHTML={{
          __html: renderSvg(pose, camera ?? clip.camera, { title: clip.name, showJoints, viewBox }),
        }}
      />
      {controls && (
        <div className="stick-motion-controls" style={{ display: 'grid', gap: 10 }}>
          <input
            aria-label="Timeline"
            type="range"
            min="0"
            max="1"
            step="0.001"
            value={state.progress}
            onChange={(e) => act(() => player.seek(Number(e.target.value)))}
          />
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              onClick={() => act(() => (state.playing ? player.pause() : player.play()))}
            >
              {state.playing ? 'Pause' : 'Play'}
            </button>
            <button type="button" onClick={() => act(() => player.restart())}>
              Restart
            </button>
            <label>
              Speed{' '}
              <select
                aria-label="Playback speed"
                value={state.speed}
                onChange={(e) => act(() => player.setSpeed(Number(e.target.value)))}
              >
                {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
                  <option key={s} value={s}>
                    {s}×
                  </option>
                ))}
              </select>
            </label>
            <output style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
              {(state.timeMs / 1000).toFixed(1)} / {(clip.durationMs / 1000).toFixed(1)}s
            </output>
          </div>
          {pose.phase && <span aria-live="polite">{pose.phase.label}</span>}
        </div>
      )}
    </div>
  );
}
