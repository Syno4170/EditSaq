// Export: render every frame with the same compositor as the preview, stream raw pixels to FFmpeg,
// and mix all sound clips with FFmpeg filters. Video clip frames are decoded by FFmpeg in order
// (much faster than seeking a <video> element for every frame).
import { useStore } from './store';
import { drawFrame, activeVisualClips } from './render';
import { projectDuration, trackOf, ANIM_PROPS } from './model';
import { getImage, pause } from './playback';

let cancelled = false;
export const cancelExport = () => { cancelled = true; };

// Displayed size of a video (respects rotation metadata, unlike the raw stream size).
function videoDims(url) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    const done = (r) => { v.removeAttribute('src'); v.load(); resolve(r); };
    v.onloadedmetadata = () => done({ w: v.videoWidth, h: v.videoHeight });
    v.onerror = () => done(null);
    v.src = url;
  });
}

function audioSpec(project) {
  const out = [];
  for (const c of project.clips) {
    if (c.type !== 'audio') continue;
    const tr = trackOf(project, c.trackId);
    const m = project.media.find((x) => x.id === c.mediaId);
    if (!m || tr?.muted || c.volume <= 0) continue;
    out.push({ path: m.path, in: c.in, duration: c.duration, speed: c.speed, volume: c.volume / 100, fadeIn: c.audioFadeIn, fadeOut: c.audioFadeOut, start: c.start });
  }
  return out;
}

// Decode size for a clip: fitted to the output frame, enlarged if the clip is zoomed in, never above the source.
function decodeSize(dims, clip, W, H) {
  const sc = clip.props.scale;
  const maxScale = Math.max(sc.v, ...sc.kf.map((k) => k.v), ANIM_PROPS.scale.def) / 100;
  const fit = Math.min(W / dims.w, H / dims.h) * Math.max(1, maxScale);
  const s = Math.min(1, fit);
  return { w: Math.max(2, Math.round((dims.w * s) / 2) * 2), h: Math.max(2, Math.round((dims.h * s) / 2) * 2) };
}

// Smallest H.264 level (High profile) that fits the frame size and rate.
function avcCodec(W, H, fps) {
  const mbs = Math.ceil(W / 16) * Math.ceil(H / 16);
  const levels = [[3600, 108000, '1f'], [8192, 245760, '28'], [8704, 522240, '2a'], [36864, 983040, '33'], [36864, 2073600, '34'], [139264, 4177920, '3c']];
  const lv = levels.find(([maxFs, maxRate]) => mbs <= maxFs && mbs * fps <= maxRate) || levels[levels.length - 1];
  return 'avc1.6400' + lv[2];
}

// WebCodecs H.264 encoder, hardware first. Returns null if this machine can't do it (export then uses FFmpeg).
async function createGpuEncoder(W, H, fps, crf, onChunk) {
  if (typeof VideoEncoder === 'undefined') return null;
  const bitsPerPixel = crf <= 17 ? 0.2 : crf <= 21 ? 0.11 : 0.06;
  const base = {
    codec: avcCodec(W, H, fps), width: W, height: H, framerate: fps,
    bitrate: Math.round(W * H * fps * bitsPerPixel), bitrateMode: 'variable', latencyMode: 'quality', avc: { format: 'annexb' },
  };
  for (const hardwareAcceleration of ['prefer-hardware', 'no-preference']) {
    const config = { ...base, hardwareAcceleration };
    try {
      if (!(await VideoEncoder.isConfigSupported(config)).supported) continue;
    } catch { continue; }
    const rec = { error: null, kind: hardwareAcceleration === 'prefer-hardware' ? 'gpu' : 'webcodecs' };
    rec.encoder = new VideoEncoder({
      output: (chunk) => { const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b); onChunk(b); },
      error: (e) => { rec.error = e; },
    });
    rec.encoder.configure(config);
    return rec;
  }
  return null;
}

export async function runExport({ out, format, scale, crf, onProgress }) {
  pause();
  cancelled = false;
  const api = window.editsaq;
  const project = useStore.getState().project;
  const total = projectDuration(project);
  if (total <= 0) return { ok: false, error: 'Your timeline is empty. Add a clip first.' };

  if (format === 'mp3') {
    onProgress?.(0.5, 'Mixing sound…');
    const r = await api.exportAudioOnly({ clips: audioSpec(project), total, out });
    return r.ok ? { ok: true, out } : r;
  }

  // Encoders need even dimensions.
  const W = Math.max(2, Math.round((project.width * scale) / 2) * 2);
  const H = Math.max(2, Math.round((project.height * scale) / 2) * 2);
  const fps = project.fps;
  const frames = Math.max(1, Math.ceil(total * fps - 1e-6));

  // H.264 is encoded on the graphics card when possible; FFmpeg then only adds the sound.
  let writeChain = Promise.resolve();
  const gpu = format === 'h264' ? await createGpuEncoder(W, H, fps, crf, (bytes) => { writeChain = writeChain.then(() => api.exportFrame(bytes)); }) : null;

  onProgress?.(0, 'Preparing sound…');
  const start = await api.exportStart({ out, width: W, height: H, fps, format, crf, audioClips: audioSpec(project), total, encoded: !!gpu });
  if (!start.ok) { gpu?.encoder.close(); return start; }

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  // GPU path keeps the canvas on the graphics card; the raw path reads pixels back every frame.
  const ctx = canvas.getContext('2d', gpu ? { alpha: false } : { willReadFrequently: true });

  // One FFmpeg decoder per video clip, opened when the clip first appears.
  const dimsCache = new Map();
  const open = new Map(); // clipId -> { canvas, ctx, img }
  const openClip = async (clip) => {
    const m = project.media.find((x) => x.id === clip.mediaId);
    if (!dimsCache.has(m.id)) dimsCache.set(m.id, await videoDims(api.toUrl(m.path)) || { w: m.width || 1920, h: m.height || 1080 });
    const dims = dimsCache.get(m.id);
    const size = decodeSize(dims, clip, project.width, project.height);
    const firstFrame = Math.ceil(clip.start * fps - 1e-6);
    const from = clip.in + Math.max(0, firstFrame / fps - clip.start) * clip.speed;
    await api.exportOpenClip({ id: clip.id, path: m.path, from, speed: clip.speed, fps, width: size.w, height: size.h });
    const rec = { w: size.w, h: size.h, frame: null, next: api.exportClipFrame(clip.id) };
    open.set(clip.id, rec);
    return rec;
  };
  const closeRec = (id) => { open.get(id)?.frame?.close(); open.delete(id); };
  const src = {
    video: (clip) => open.get(clip.id)?.frame,
    image: (mediaId) => {
      const m = project.media.find((x) => x.id === mediaId);
      return m ? getImage(mediaId, m) : null;
    },
  };
  // Make sure every picture is loaded before we start.
  for (const m of project.media) if (m.type === 'image') {
    for (let i = 0; i < 100 && !getImage(m.id, m); i++) await new Promise((r) => setTimeout(r, 50));
  }

  const t0 = performance.now();
  const stats = { decode: 0, draw: 0, read: 0, write: 0 };
  let mark = performance.now();
  const lap = (k) => { const n = performance.now(); stats[k] += n - mark; mark = n; };
  let pendingWrite = null;
  try {
    for (let f = 0; f < frames; f++) {
      if (cancelled) {
        if (gpu) gpu.encoder.close();
        await pendingWrite;
        await writeChain;
        await api.exportCancel();
        return { ok: false, cancelled: true };
      }
      if (gpu?.error) throw gpu.error;
      const t = f / fps;
      for (const c of activeVisualClips(project, t)) {
        if (c.type !== 'video') continue;
        mark = performance.now();
        const rec = open.get(c.id) || await openClip(c);
        const px = await rec.next;
        lap('decode');
        rec.next = api.exportClipFrame(c.id); // decode the following frame while we draw this one
        if (px) { // else: source ran out, hold last frame
          rec.frame?.close();
          rec.frame = new VideoFrame(px, { format: 'I420', codedWidth: rec.w, codedHeight: rec.h, timestamp: 0 });
        }
      }
      // Close decoders for clips that have finished.
      for (const id of [...open.keys()]) {
        const c = project.clips.find((x) => x.id === id);
        if (!c || t >= c.start + c.duration) { api.exportCloseClip(id); closeRec(id); }
      }
      mark = performance.now();
      ctx.setTransform(W / project.width, 0, 0, H / project.height, 0, 0);
      drawFrame(ctx, project, t, src);
      lap('draw');
      if (gpu) {
        const frame = new VideoFrame(canvas, { timestamp: Math.round((f * 1e6) / fps), duration: Math.round(1e6 / fps) });
        gpu.encoder.encode(frame, { keyFrame: f % (fps * 2) === 0 });
        frame.close();
        lap('read');
        while (gpu.encoder.encodeQueueSize > 4) await new Promise((r) => gpu.encoder.addEventListener('dequeue', r, { once: true }));
        lap('write');
      } else {
        const px = ctx.getImageData(0, 0, W, H).data;
        lap('read');
        await pendingWrite;
        lap('write');
        pendingWrite = api.exportFrame(new Uint8Array(px.buffer));
      }
      if (f % 5 === 0 || f === frames - 1) {
        const elapsed = (performance.now() - t0) / 1000;
        const eta = (elapsed / (f + 1)) * (frames - f - 1);
        onProgress?.((f + 1) / frames, `Frame ${f + 1} of ${frames} · about ${Math.ceil(eta)}s left`);
      }
    }
    await pendingWrite;
    if (gpu) {
      await gpu.encoder.flush();
      gpu.encoder.close();
      if (gpu.error) throw gpu.error;
    }
    await writeChain;
    for (const id of [...open.keys()]) closeRec(id);
  } catch (e) {
    for (const id of [...open.keys()]) closeRec(id);
    try { gpu?.encoder.close(); } catch {}
    await api.exportCancel();
    return { ok: false, error: String(e.message || e) };
  }
  onProgress?.(1, 'Finishing file…');
  const r = await api.exportFinish();
  for (const k in stats) stats[k] = Math.round(stats[k]);
  return { ...r, stats, encoder: gpu ? gpu.kind : 'ffmpeg' };
}
