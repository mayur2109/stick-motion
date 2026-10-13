import type { MotionClip } from './types.js';
export function createPlayer(clip: MotionClip, clock = () => performance.now()) {
  let time = 0,
    anchor = clock(),
    speed = 1,
    playing = false;
  const update = () => {
    const now = clock();
    if (playing) {
      time += (now - anchor) * speed;
      if (time >= clip.durationMs) {
        if (clip.loop) time %= clip.durationMs;
        else {
          time = clip.durationMs;
          playing = false;
        }
      }
    }
    anchor = now;
  };
  return {
    play() {
      update();
      if (!clip.loop && time === clip.durationMs) time = 0;
      playing = true;
    },
    pause() {
      update();
      playing = false;
    },
    restart() {
      time = 0;
      anchor = clock();
    },
    seek(progress: number) {
      if (!Number.isFinite(progress)) throw new Error('Progress must be finite');
      update();
      time = Math.max(0, Math.min(1, progress)) * clip.durationMs;
    },
    setSpeed(value: number) {
      if (!Number.isFinite(value) || value < 0.25 || value > 2)
        throw new Error('Speed must be between 0.25 and 2');
      update();
      speed = value;
    },
    getState() {
      update();
      const progress = time / clip.durationMs;
      return {
        timeMs: time,
        progress,
        playing,
        speed,
        phase: clip.phases?.find(
          (p) => progress >= p.start && (progress < p.end || (progress === 1 && p.end === 1)),
        ),
      };
    },
  };
}
