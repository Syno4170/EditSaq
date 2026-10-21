// Live preview engine: a requestAnimationFrame clock that keeps one <video>/<audio> element per clip
// in step with the playhead and redraws the program monitor every frame.
import { useStore, useTime, useMediaCache } from './store';
import { drawFrame } from './render';
import { clipEnd, projectDuration, trackOf } from './model';

const videoEls = new Map(); // clipId -> { el, url }
const audioEls = new Map(); // clipId -> { el, url, gain }
const images = new Map(); // mediaId -> { img, url }
let audioCtx = null;
let canvas = null;
let quality = 0.5;
let lastNow = 0;

const playUrl = (media) => {
  const cache = useMediaCache.getState()[media.id];
  return window.editsaq.toUrl(cache?.playPath || media.path);
};

function getVideo(clip, media) {
  const url = playUrl(media);
  let rec = videoEls.get(clip.id);
  if (!rec || rec.url !== url) {
    if (rec) { rec.el.pause(); rec.el.removeAttribute('src'); rec.el.load(); }
    const el = document.createElement('video');
    el.crossOrigin = 'anonymous';
    el.preload = 'auto';
    el.muted = true;
    el.playsInline = true;
    el.src = url;
    rec = { el, url };
    videoEls.set(clip.id, rec);
  }
  return rec.el;
}

function getAudio(clip, media) {
  const url = playUrl(media);
  let rec = audioEls.get(clip.id);
  if (!rec || rec.url !== url) {
    if (rec) { rec.el.pause(); rec.el.removeAttribute('src'); rec.el.load(); rec.gain.disconnect(); }
    audioCtx ||= new AudioContext();
    const el = new Audio();
    el.crossOrigin = 'anonymous';
    el.preload = 'auto';
    el.src = url;
    const source = audioCtx.createMediaElementSource(el);
    const gain = audioCtx.createGain();
    source.connect(gain).connect(audioCtx.destination);
    rec = { el, url, gain };
    audioEls.set(clip.id, rec);
  }
  return rec;
}

export function getImage(mediaId, media) {
  const url = window.editsaq.toUrl(media.path);
  let rec = images.get(mediaId);
  if (!rec || rec.url !== url) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    rec = { img, url };
    images.set(mediaId, rec);
  }
  return rec.img.complete && rec.img.naturalWidth ? rec.img : null;
}

export function audioGainAt(clip, lt) {
  let g = clip.volume / 100;
  if (clip.audioFadeIn > 0 && lt < clip.audioFadeIn) g *= Math.max(0, lt / clip.audioFadeIn);
  const left = clip.duration - lt;
  if (clip.audioFadeOut > 0 && left < clip.audioFadeOut) g *= Math.max(0, left / clip.audioFadeOut);
  return g;
}

function syncMedia(project, t, playing) {
  const mediaById = new Map(project.media.map((m) => [m.id, m]));
  const liveV = new Set();
  const liveA = new Set();
  const frame = 1 / project.fps;
  for (const c of project.clips) {
    const active = t >= c.start && t < clipEnd(c);
    // Warm up clips that start within the next second so they're ready to play.
    const soon = playing && c.start > t && c.start - t < 1;
    if (!active && !soon) continue;
    const media = mediaById.get(c.mediaId);
    if (!media) continue;
    const track = trackOf(project, c.trackId);
    const target = c.in + Math.max(0, t - c.start) * c.speed;
    if (c.type === 'video') {
      if (track?.hidden) continue;
      liveV.add(c.id);
      const el = getVideo(c, media);
      if (!active) { if (Math.abs(el.currentTime - c.in) > 0.05) el.currentTime = c.in; continue; }
      el.playbackRate = c.speed;
      if (playing) {
        if (el.paused) { el.currentTime = target; el.play().catch(() => {}); }
        else if (Math.abs(el.currentTime - target) > 0.2 * Math.max(1, c.speed)) el.currentTime = target;
      } else {
        if (!el.paused) el.pause();
        if (Math.abs(el.currentTime - target) > frame / 2 && !el.seeking) el.currentTime = target;
      }
    } else if (c.type === 'audio') {
      liveA.add(c.id);
      const rec = getAudio(c, media);
      const el = rec.el;
      const lt = t - c.start;
      rec.gain.gain.value = track?.muted ? 0 : audioGainAt(c, Math.max(0, lt));
      if (!active) { if (!el.paused) el.pause(); continue; }
      el.playbackRate = c.speed;
      el.preservesPitch = true;
      if (playing) {
        if (audioCtx?.state === 'suspended') audioCtx.resume();
        if (el.paused) { el.currentTime = target; el.play().catch(() => {}); }
        else if (Math.abs(el.currentTime - target) > 0.15 * Math.max(1, c.speed)) el.currentTime = target;
      } else if (!el.paused) el.pause();
    }
  }
  for (const [id, rec] of videoEls) {
    if (liveV.has(id)) continue;
    if (!rec.el.paused) rec.el.pause();
    if (!project.clips.some((c) => c.id === id)) { rec.el.removeAttribute('src'); rec.el.load(); videoEls.delete(id); }
  }
  for (const [id, rec] of audioEls) {
    if (liveA.has(id)) continue;
    if (!rec.el.paused) rec.el.pause();
    if (!project.clips.some((c) => c.id === id)) { rec.el.removeAttribute('src'); rec.el.load(); rec.gain.disconnect(); audioEls.delete(id); }
  }
}

export const previewSources = {
  video: (clip) => videoEls.get(clip.id)?.el,
  image: (mediaId) => {
    const media = useStore.getState().project.media.find((m) => m.id === mediaId);
    return media ? getImage(mediaId, media) : null;
  },
};

function render() {
  if (!canvas) return;
  const { project } = useStore.getState();
  const w = Math.max(2, Math.round(project.width * quality));
  const h = Math.max(2, Math.round(project.height * quality));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(quality, 0, 0, quality, 0, 0);
  drawFrame(ctx, project, useTime.getState().t, previewSources);
}

function tick(nowMs) {
  const { project } = useStore.getState();
  const ts = useTime.getState();
  if (ts.playing) {
    const dt = Math.min(0.1, (nowMs - lastNow) / 1000);
    let t = ts.t + dt;
    const end = projectDuration(project);
    if (t >= end) { t = end; useTime.setState({ t, playing: false }); }
    else useTime.setState({ t });
  }
  lastNow = nowMs;
  const { t, playing } = useTime.getState();
  syncMedia(project, t, playing);
  render();
  requestAnimationFrame(tick);
}

let started = false;
export function startEngine() {
  if (started) return;
  started = true;
  requestAnimationFrame((n) => { lastNow = n; tick(n); });
}

export function setPreviewCanvas(c) { canvas = c; }
export function setPreviewQuality(q) { quality = q; }

export function play() {
  const end = projectDuration(useStore.getState().project);
  if (end <= 0) return;
  audioCtx ||= new AudioContext();
  audioCtx.resume();
  const { t } = useTime.getState();
  useTime.setState({ playing: true, t: t >= end - 0.01 ? 0 : t });
}
export function pause() { useTime.setState({ playing: false }); }
export function togglePlay() { useTime.getState().playing ? pause() : play(); }

export function seek(t) {
  const end = projectDuration(useStore.getState().project);
  useTime.setState({ t: Math.max(0, Math.min(t, Math.max(end, 0))) });
}
export function stepFrames(n) {
  const { project } = useStore.getState();
  pause();
  const f = Math.round(useTime.getState().t * project.fps) + n;
  seek(f / project.fps);
}

export function snapshotDataUrl() {
  const { project } = useStore.getState();
  const c = document.createElement('canvas');
  c.width = project.width;
  c.height = project.height;
  drawFrame(c.getContext('2d'), project, useTime.getState().t, previewSources);
  return c.toDataURL('image/png');
}
