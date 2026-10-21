// Draws one frame of the project onto a 2D canvas. Used by both the live preview and the exporter,
// so what you see is exactly what you export.
import { evalProp, clipEnd } from './model';

const layerCanvas = document.createElement('canvas');
const layerCtx = layerCanvas.getContext('2d', { willReadFrequently: true });

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Transition progress p goes 0 -> 1 as the clip becomes fully visible.
function applyTransition(type, p, dir, s, W, H) {
  const inv = 1 - p;
  const sign = dir === 'in' ? 1 : -1;
  switch (type) {
    case 'fade': s.opacity *= p; break;
    case 'slide-left': s.x += sign * inv * W; break;
    case 'slide-right': s.x -= sign * inv * W; break;
    case 'slide-up': s.y += sign * inv * H; break;
    case 'slide-down': s.y -= sign * inv * H; break;
    case 'zoom': s.scale *= 0.3 + 0.7 * p; s.opacity *= p; break;
    case 'wipe-left': s.wipe = { from: dir === 'in' ? 'right' : 'left', p }; break;
    case 'wipe-right': s.wipe = { from: dir === 'in' ? 'left' : 'right', p }; break;
    case 'blur': s.blur += inv * 40; s.opacity *= p; break;
    case 'spin': s.rotation += sign * inv * 180; s.scale *= p; s.opacity *= p; break;
    case 'iris': s.mask = { kind: 'iris', p }; break;
    case 'clock': s.mask = { kind: 'clock', p }; break;
    case 'flash': s.overlay = { color: '#ffffff', a: Math.max(s.overlay?.a || 0, inv) }; break;
    case 'dip-black': s.overlay = { color: '#000000', a: Math.max(s.overlay?.a || 0, inv) }; break;
  }
}

// Clip region for wipe-style transitions, in project pixels.
function applyMask(ctx, s, W, H) {
  ctx.beginPath();
  if (s.wipe) {
    const p = s.wipe.p;
    if (s.wipe.from === 'left') ctx.rect(0, 0, W * p, H);
    else ctx.rect(W * (1 - p), 0, W * p, H);
  } else if (s.mask.kind === 'iris') {
    ctx.arc(W / 2, H / 2, (Math.hypot(W, H) / 2) * s.mask.p, 0, Math.PI * 2);
  } else {
    const a0 = -Math.PI / 2;
    ctx.moveTo(W / 2, H / 2);
    ctx.arc(W / 2, H / 2, Math.hypot(W, H), a0, a0 + Math.PI * 2 * s.mask.p);
    ctx.closePath();
  }
  ctx.clip();
}

export function clipState(clip, t, W, H) {
  const lt = t - clip.start;
  const P = (k) => evalProp(clip.props[k], lt);
  const s = {
    x: P('x'), y: P('y'), scale: P('scale') / 100, rotation: P('rotation'), opacity: P('opacity') / 100,
    brightness: P('brightness'), contrast: P('contrast'), saturation: P('saturation'), hue: P('hue'), blur: P('blur'),
    wipe: null, mask: null, overlay: null,
  };
  if (clip.transIn && lt < clip.transIn.dur) applyTransition(clip.transIn.type, Math.max(0, lt / clip.transIn.dur), 'in', s, W, H);
  const left = clip.duration - lt;
  if (clip.transOut && left < clip.transOut.dur) applyTransition(clip.transOut.type, Math.max(0, left / clip.transOut.dur), 'out', s, W, H);
  return s;
}

function textFont(tx) {
  return `${tx.italic ? 'italic ' : ''}${tx.bold ? '700' : '400'} ${tx.size}px "${tx.font}", "Segoe UI", sans-serif`;
}

// Size of the clip's content before scaling, in project pixels.
export function contentSize(clip, src, W, H, ctx) {
  if (clip.type === 'video' || clip.type === 'image') {
    const el = clip.type === 'video' ? src.video(clip) : src.image(clip.mediaId);
    // Preview draws <video> elements; export draws VideoFrames (displayWidth/displayHeight).
    const w = clip.type === 'video' ? el?.videoWidth ?? el?.displayWidth : el?.naturalWidth;
    const h = clip.type === 'video' ? el?.videoHeight ?? el?.displayHeight : el?.naturalHeight;
    if (!w || !h) return null;
    const fit = Math.min(W / w, H / h);
    return { w: w * fit, h: h * fit, el };
  }
  if (clip.type === 'solid') return { w: W, h: H };
  if (clip.type === 'shape') return { w: clip.shape.w, h: clip.shape.h };
  if (clip.type === 'text') {
    const tx = clip.text;
    ctx.save();
    ctx.font = textFont(tx);
    const lines = tx.content.split('\n');
    const w = Math.max(1, ...lines.map((l) => ctx.measureText(l).width));
    ctx.restore();
    const lh = tx.size * 1.2;
    return { w: w + (tx.bg ? tx.bgPad * 2 : 0), h: lines.length * lh + (tx.bg ? tx.bgPad * 2 : 0), lines, lh, textW: w };
  }
  return null;
}

function drawContent(ctx, clip, size, lt) {
  const { w, h } = size;
  if (clip.type === 'video' || clip.type === 'image') {
    ctx.drawImage(size.el, -w / 2, -h / 2, w, h);
  } else if (clip.type === 'solid') {
    ctx.fillStyle = clip.color;
    ctx.fillRect(-w / 2, -h / 2, w, h);
  } else if (clip.type === 'shape') {
    const sh = clip.shape;
    ctx.beginPath();
    if (sh.kind === 'ellipse') ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
    else ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(sh.radius, w / 2, h / 2));
    ctx.fillStyle = sh.fill;
    ctx.fill();
    if (sh.strokeWidth > 0) { ctx.lineWidth = sh.strokeWidth; ctx.strokeStyle = sh.stroke; ctx.stroke(); }
  } else if (clip.type === 'text') {
    const tx = clip.text;
    if (tx.bg) { ctx.fillStyle = tx.bg; ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, tx.bgPad * 0.6); ctx.fill(); }
    ctx.font = textFont(tx);
    ctx.textBaseline = 'middle';
    ctx.textAlign = tx.align;
    const ax = tx.align === 'left' ? -size.textW / 2 : tx.align === 'right' ? size.textW / 2 : 0;
    let lines = size.lines;
    if (tx.anim === 'typewriter') {
      const total = tx.content.replace(/\n/g, '').length;
      let n = Math.floor(total * Math.min(1, lt / Math.max(0.05, tx.animDur)));
      lines = lines.map((l) => { const part = l.slice(0, Math.max(0, n)); n -= l.length; return part; });
    }
    const top = -(size.lines.length * size.lh) / 2 + size.lh / 2;
    lines.forEach((line, i) => {
      const y = top + i * size.lh;
      if (tx.shadow) { ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = tx.size * 0.12; ctx.shadowOffsetY = tx.size * 0.04; }
      if (tx.strokeWidth > 0) { ctx.lineWidth = tx.strokeWidth * 2; ctx.strokeStyle = tx.stroke; ctx.lineJoin = 'round'; ctx.strokeText(line, ax, y); }
      ctx.fillStyle = tx.color;
      ctx.fillText(line, ax, y);
      ctx.shadowColor = 'transparent';
    });
  }
}

// Chroma key and vignette need pixel access, so the clip is drawn to a scratch layer first.
function drawProcessedLayer(ctx, clip, size, lt) {
  const lw = Math.max(1, Math.round(size.w));
  const lh = Math.max(1, Math.round(size.h));
  if (layerCanvas.width !== lw || layerCanvas.height !== lh) { layerCanvas.width = lw; layerCanvas.height = lh; }
  layerCtx.setTransform(1, 0, 0, 1, 0, 0);
  layerCtx.clearRect(0, 0, lw, lh);
  layerCtx.translate(lw / 2, lh / 2);
  drawContent(layerCtx, clip, size, lt);
  layerCtx.setTransform(1, 0, 0, 1, 0, 0);
  const fx = clip.fx;
  if (fx.chroma.on) {
    const img = layerCtx.getImageData(0, 0, lw, lh);
    const d = img.data;
    const [kr, kg, kb] = hexToRgb(fx.chroma.color);
    const tol = (fx.chroma.tol / 100) * 442;
    const soft = Math.max(1, (fx.chroma.soft / 100) * 442);
    for (let i = 0; i < d.length; i += 4) {
      const dr = d[i] - kr, dg = d[i + 1] - kg, db = d[i + 2] - kb;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist < tol) d[i + 3] = 0;
      else if (dist < tol + soft) d[i + 3] = Math.round(d[i + 3] * ((dist - tol) / soft));
    }
    layerCtx.putImageData(img, 0, 0);
  }
  if (fx.vignette > 0) {
    layerCtx.globalCompositeOperation = 'source-atop';
    const g = layerCtx.createRadialGradient(lw / 2, lh / 2, Math.min(lw, lh) * 0.25, lw / 2, lh / 2, Math.hypot(lw, lh) / 2);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${fx.vignette / 100})`);
    layerCtx.fillStyle = g;
    layerCtx.fillRect(0, 0, lw, lh);
    layerCtx.globalCompositeOperation = 'source-over';
  }
  ctx.drawImage(layerCanvas, -size.w / 2, -size.h / 2, size.w, size.h);
}

export function drawClip(ctx, project, clip, t, src) {
  const W = project.width, H = project.height;
  const size = contentSize(clip, src, W, H, ctx);
  if (!size) return;
  const s = clipState(clip, t, W, H);
  if (s.overlay && (clip.type === 'text' || clip.type === 'shape')) { s.opacity *= 1 - s.overlay.a; s.overlay = null; }
  if (s.opacity <= 0.001 || s.scale <= 0.0001) return;
  const fx = clip.fx;
  ctx.save();
  if (s.wipe || s.mask) applyMask(ctx, s, W, H);
  ctx.globalAlpha = s.opacity;
  ctx.globalCompositeOperation = clip.blend || 'source-over';
  const filters = [];
  if (s.brightness !== 100) filters.push(`brightness(${s.brightness}%)`);
  if (s.contrast !== 100) filters.push(`contrast(${s.contrast}%)`);
  if (s.saturation !== 100) filters.push(`saturate(${s.saturation}%)`);
  if (s.hue) filters.push(`hue-rotate(${s.hue}deg)`);
  if (s.blur > 0) filters.push(`blur(${s.blur}px)`);
  if (fx.grayscale) filters.push(`grayscale(${fx.grayscale}%)`);
  if (fx.sepia) filters.push(`sepia(${fx.sepia}%)`);
  if (fx.invert) filters.push(`invert(${fx.invert}%)`);
  ctx.filter = filters.length ? filters.join(' ') : 'none';
  ctx.translate(W / 2 + s.x, H / 2 + s.y);
  if (s.rotation) ctx.rotate((s.rotation * Math.PI) / 180);
  ctx.scale(s.scale * (fx.flipH ? -1 : 1), s.scale * (fx.flipV ? -1 : 1));
  const lt = t - clip.start;
  if (fx.chroma.on || fx.vignette > 0) drawProcessedLayer(ctx, clip, size, lt);
  else drawContent(ctx, clip, size, lt);
  if (s.overlay && s.overlay.a > 0) {
    // Flash / dip: cover the clip's rectangle with white or black (text & shapes fade instead, see above).
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = s.opacity * s.overlay.a;
    ctx.fillStyle = s.overlay.color;
    ctx.fillRect(-size.w / 2, -size.h / 2, size.w, size.h);
  }
  ctx.restore();
}

export function activeVisualClips(project, t) {
  const out = [];
  const vTracks = project.tracks.filter((tr) => tr.kind === 'video');
  // Bottom track first: tracks listed later draw on top.
  for (const tr of vTracks) {
    if (tr.hidden) continue;
    for (const c of project.clips) if (c.trackId === tr.id && t >= c.start && t < clipEnd(c)) out.push(c);
  }
  return out;
}

export function drawFrame(ctx, project, t, src) {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.fillStyle = project.background;
  ctx.fillRect(0, 0, project.width, project.height);
  for (const c of activeVisualClips(project, t)) drawClip(ctx, project, c, t, src);
  ctx.restore();
}
