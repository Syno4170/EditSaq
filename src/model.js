// Project data model: factories, keyframe math and timeline helpers. Everything here is plain data
// so projects can be saved as JSON and undone with immutable snapshots.

export const uid = () => Math.random().toString(36).slice(2, 10);

export const VIDEO_EXT = ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'wmv', 'flv', 'mts', 'm2ts', '3gp'];
export const AUDIO_EXT = ['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg', 'opus', 'wma'];
export const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'];

export function mediaTypeOf(path) {
  const ext = path.split('.').pop().toLowerCase();
  if (VIDEO_EXT.includes(ext)) return 'video';
  if (AUDIO_EXT.includes(ext)) return 'audio';
  if (IMAGE_EXT.includes(ext)) return 'image';
  return null;
}

// Properties that can be animated with keyframes (the After Effects part).
export const ANIM_PROPS = {
  x: { label: 'Left / Right', def: 0, step: 1, unit: 'px' },
  y: { label: 'Up / Down', def: 0, step: 1, unit: 'px' },
  scale: { label: 'Size', def: 100, min: 0, max: 1000, step: 1, unit: '%' },
  rotation: { label: 'Rotate', def: 0, min: -3600, max: 3600, step: 1, unit: '°' },
  opacity: { label: 'Visibility', def: 100, min: 0, max: 100, step: 1, unit: '%' },
  brightness: { label: 'Brightness', def: 100, min: 0, max: 300, step: 1, unit: '%' },
  contrast: { label: 'Contrast', def: 100, min: 0, max: 300, step: 1, unit: '%' },
  saturation: { label: 'Color strength', def: 100, min: 0, max: 300, step: 1, unit: '%' },
  hue: { label: 'Color shift', def: 0, min: -180, max: 180, step: 1, unit: '°' },
  blur: { label: 'Blur', def: 0, min: 0, max: 100, step: 0.5, unit: 'px' },
};

export const EASINGS = [
  { id: 'linear', label: 'Steady' },
  { id: 'ease', label: 'Smooth' },
  { id: 'in', label: 'Speed up' },
  { id: 'out', label: 'Slow down' },
  { id: 'hold', label: 'Jump (no motion)' },
];

export const TRANSITIONS = [
  { id: 'fade', label: 'Fade', icon: '◐' },
  { id: 'slide-left', label: 'Slide left', icon: '⇠' },
  { id: 'slide-right', label: 'Slide right', icon: '⇢' },
  { id: 'slide-up', label: 'Slide up', icon: '⇡' },
  { id: 'slide-down', label: 'Slide down', icon: '⇣' },
  { id: 'zoom', label: 'Zoom', icon: '⤢' },
  { id: 'wipe-left', label: 'Wipe left', icon: '▤' },
  { id: 'wipe-right', label: 'Wipe right', icon: '▥' },
  { id: 'blur', label: 'Blur', icon: '◌' },
  { id: 'spin', label: 'Spin', icon: '↻' },
  { id: 'iris', label: 'Circle reveal', icon: '◯' },
  { id: 'clock', label: 'Clock wipe', icon: '◔' },
  { id: 'flash', label: 'Flash (white)', icon: '✦' },
  { id: 'dip-black', label: 'Dip to black', icon: '●' },
];

export const BLEND_MODES = [
  ['source-over', 'Normal'], ['multiply', 'Multiply'], ['screen', 'Screen'], ['overlay', 'Overlay'],
  ['darken', 'Darken'], ['lighten', 'Lighten'], ['color-dodge', 'Color dodge'], ['color-burn', 'Color burn'],
  ['hard-light', 'Hard light'], ['soft-light', 'Soft light'], ['difference', 'Difference'], ['lighter', 'Add'],
];

export const FONTS = ['Segoe UI', 'Arial', 'Arial Black', 'Bahnschrift', 'Impact', 'Georgia', 'Times New Roman', 'Verdana',
  'Trebuchet MS', 'Tahoma', 'Courier New', 'Consolas', 'Comic Sans MS', 'Segoe Script', 'Gabriola'];

export const PRESET_SIZES = [
  { id: 'youtube', label: 'YouTube / Widescreen', sub: '16:9 · 1920×1080', width: 1920, height: 1080 },
  { id: 'vertical', label: 'TikTok / Reels / Shorts', sub: '9:16 · 1080×1920', width: 1080, height: 1920 },
  { id: 'square', label: 'Instagram post', sub: '1:1 · 1080×1080', width: 1080, height: 1080 },
  { id: '4k', label: '4K Ultra HD', sub: '16:9 · 3840×2160', width: 3840, height: 2160 },
  { id: '720', label: 'HD (smaller files)', sub: '16:9 · 1280×720', width: 1280, height: 720 },
  { id: 'portrait45', label: 'Instagram portrait', sub: '4:5 · 1080×1350', width: 1080, height: 1350 },
];

export function newProject(opts = {}) {
  return {
    version: 1,
    name: opts.name || 'My video',
    width: opts.width || 1920,
    height: opts.height || 1080,
    fps: opts.fps || 30,
    background: '#000000',
    media: [],
    tracks: [
      { id: 'v1', kind: 'video', name: 'Video 1', hidden: false, locked: false, muted: false },
      { id: 'v2', kind: 'video', name: 'Video 2', hidden: false, locked: false, muted: false },
      { id: 'v3', kind: 'video', name: 'Text & titles', hidden: false, locked: false, muted: false },
      { id: 'a1', kind: 'audio', name: 'Sound 1', hidden: false, locked: false, muted: false },
      { id: 'a2', kind: 'audio', name: 'Music', hidden: false, locked: false, muted: false },
    ],
    clips: [],
    markers: [],
  };
}

export function makeProps() {
  const p = {};
  for (const [k, d] of Object.entries(ANIM_PROPS)) p[k] = { v: d.def, kf: [] };
  return p;
}

export function makeClip(type, fields = {}) {
  return {
    id: uid(),
    type, // video | audio | image | text | shape | solid
    trackId: null,
    mediaId: null,
    name: '',
    start: 0,
    duration: 5,
    in: 0,
    speed: 1,
    volume: 100,
    audioFadeIn: 0,
    audioFadeOut: 0,
    linkId: null,
    props: makeProps(),
    fx: { grayscale: 0, sepia: 0, invert: 0, vignette: 0, flipH: false, flipV: false, chroma: { on: false, color: '#00ff00', tol: 28, soft: 12 } },
    blend: 'source-over',
    transIn: null,
    transOut: null,
    text: null,
    shape: null,
    color: null,
    ...fields,
  };
}

export const defaultText = (content = 'Your title here') => ({
  content, font: 'Segoe UI', size: 110, color: '#ffffff', bold: true, italic: false, align: 'center',
  stroke: '#000000', strokeWidth: 0, shadow: true, bg: '', bgPad: 24, anim: 'none', animDur: 1,
});

export const defaultShape = (kind = 'rect') => ({ kind, w: 600, h: 340, fill: '#3b82f6', stroke: '#ffffff', strokeWidth: 0, radius: 24 });

// ---------- keyframes ----------

function ease(p, mode) {
  switch (mode) {
    case 'ease': return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    case 'in': return p * p * p;
    case 'out': return 1 - Math.pow(1 - p, 3);
    case 'hold': return 0;
    default: return p;
  }
}

export function evalProp(prop, t) {
  const k = prop.kf;
  if (!k.length) return prop.v;
  if (t <= k[0].t) return k[0].v;
  const last = k[k.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 0; i < k.length - 1; i++) {
    const a = k[i], b = k[i + 1];
    if (t >= a.t && t < b.t) return a.v + (b.v - a.v) * ease((t - a.t) / (b.t - a.t), a.ease);
  }
  return last.v;
}

export const KF_EPS = 1 / 120;

export const kfAt = (prop, t) => prop.kf.find((k) => Math.abs(k.t - t) < KF_EPS);

// Write a value: if the property is animated, add/update a keyframe at t, otherwise set the static value.
export function writeProp(prop, t, v) {
  if (!prop.kf.length) { prop.v = v; return; }
  const k = kfAt(prop, t);
  if (k) k.v = v;
  else { prop.kf.push({ t, v, ease: 'ease' }); prop.kf.sort((a, b) => a.t - b.t); }
}

// ---------- timeline helpers ----------

export const clipEnd = (c) => c.start + c.duration;

export function projectDuration(project) {
  let d = 0;
  for (const c of project.clips) d = Math.max(d, clipEnd(c));
  return d;
}

export function mediaOf(project, clip) {
  return clip.mediaId ? project.media.find((m) => m.id === clip.mediaId) : null;
}

export function trackOf(project, id) {
  return project.tracks.find((t) => t.id === id);
}

// Clip ids plus every clip linked to them (video + its sound move together).
export function withLinked(project, ids) {
  const set = new Set(ids);
  const links = new Set(project.clips.filter((c) => set.has(c.id) && c.linkId).map((c) => c.linkId));
  for (const c of project.clips) if (c.linkId && links.has(c.linkId)) set.add(c.id);
  return set;
}

export function shiftKeyframes(clip, dt) {
  for (const p of Object.values(clip.props)) for (const k of p.kf) k.t += dt;
}

// Cut a clip into two at timeline time t. Returns the new right-hand clip (or null).
export function splitClip(clip, t) {
  if (t <= clip.start + 0.01 || t >= clipEnd(clip) - 0.01) return null;
  const right = JSON.parse(JSON.stringify(clip));
  right.id = uid();
  const offset = t - clip.start;
  right.start = t;
  right.duration = clip.duration - offset;
  right.in = clip.in + offset * clip.speed;
  right.transIn = null;
  right.audioFadeIn = 0;
  shiftKeyframes(right, -offset);
  clip.duration = offset;
  clip.transOut = null;
  clip.audioFadeOut = 0;
  return right;
}

// "Overwrite" editing like Premiere: clips placed on a track cut away whatever they land on.
export function resolveOverlaps(project, placedIds) {
  const placed = project.clips.filter((c) => placedIds.has(c.id));
  for (const m of placed) {
    const ms = m.start, me = clipEnd(m);
    const others = project.clips.filter((c) => c.trackId === m.trackId && !placedIds.has(c.id));
    for (const c of others) {
      const cs = c.start, ce = clipEnd(c);
      if (ce <= ms + 1e-6 || cs >= me - 1e-6) continue;
      if (cs >= ms && ce <= me) {
        project.clips.splice(project.clips.indexOf(c), 1);
      } else if (cs < ms && ce > me) {
        const right = splitClip(c, me);
        if (right) project.clips.push(right);
        c.duration = ms - cs;
      } else if (cs < ms) {
        c.duration = ms - cs;
        c.transOut = null;
      } else {
        const d = me - cs;
        c.start = me;
        c.duration -= d;
        c.in += d * c.speed;
        shiftKeyframes(c, -d);
        c.transIn = null;
      }
    }
  }
}

export function formatTime(t, fps = 30, withFrames = true) {
  t = Math.max(0, t);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const f = Math.floor((t - Math.floor(t)) * fps + 1e-6);
  const pad = (n) => String(n).padStart(2, '0');
  const base = (h ? h + ':' : '') + pad(m) + ':' + pad(s);
  return withFrames ? base + '.' + pad(f) : base;
}
