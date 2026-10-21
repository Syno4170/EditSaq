// Importing media: read file info with FFmpeg, make thumbnails and waveforms, and create
// editing copies for formats the built-in player can't decode.
import { useStore, patchCache } from './store';
import { mediaTypeOf, uid } from './model';

const api = () => window.editsaq;

function loadVideoMeta(url) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous';
    v.preload = 'auto';
    v.muted = true;
    const done = (ok) => { clearTimeout(timer); resolve(ok ? v : null); };
    const timer = setTimeout(() => done(false), 15000);
    v.onloadeddata = () => done(v.videoWidth > 0);
    v.onerror = () => done(false);
    v.src = url;
  });
}

function captureThumb(el, w, h, time) {
  return new Promise((resolve) => {
    const draw = () => {
      try {
        const c = document.createElement('canvas');
        const tw = 192;
        c.width = tw;
        c.height = Math.max(1, Math.round((tw * h) / w));
        c.getContext('2d').drawImage(el, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.75));
      } catch { resolve(null); }
    };
    if (time == null) return draw();
    el.onseeked = draw;
    el.currentTime = time;
    setTimeout(() => resolve(null), 8000);
  });
}

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Build thumbnails / waveform / proxy for a media item (also used when reopening a project).
export async function prepareMedia(media) {
  const { updateMediaInfo } = useStore.getState();
  if (!(await api().exists(media.path))) { patchCache(media.id, { status: 'missing' }); return; }
  patchCache(media.id, { status: 'loading' });
  if (media.type === 'image') {
    const img = await loadImage(api().toUrl(media.path));
    if (!img) { patchCache(media.id, { status: 'error' }); return; }
    updateMediaInfo(media.id, { width: img.naturalWidth, height: img.naturalHeight });
    patchCache(media.id, { status: 'ready', thumb: await captureThumb(img, img.naturalWidth, img.naturalHeight) });
    return;
  }
  if (media.hasAudio || media.type === 'audio') {
    api().peaks(media.path).then((peaks) => patchCache(media.id, { peaks }));
  }
  if (media.type === 'audio') { patchCache(media.id, { status: 'ready' }); return; }
  let el = await loadVideoMeta(api().toUrl(media.path));
  if (!el) {
    patchCache(media.id, { status: 'converting' });
    const proxy = await api().proxy(media.path);
    if (!proxy) { patchCache(media.id, { status: 'error' }); return; }
    patchCache(media.id, { playPath: proxy });
    el = await loadVideoMeta(api().toUrl(proxy));
    if (!el) { patchCache(media.id, { status: 'error' }); return; }
  }
  if (!media.width) updateMediaInfo(media.id, { width: el.videoWidth, height: el.videoHeight });
  if (!media.duration && isFinite(el.duration)) updateMediaInfo(media.id, { duration: el.duration });
  const thumb = await captureThumb(el, el.videoWidth, el.videoHeight, Math.min(1, (el.duration || 2) / 3));
  el.removeAttribute('src');
  el.load();
  patchCache(media.id, { status: 'ready', thumb });
}

export async function importPaths(paths, { place = false } = {}) {
  const store = useStore.getState();
  let skipped = 0;
  const added = [];
  for (const path of paths) {
    const type = mediaTypeOf(path);
    if (!type) { skipped++; continue; }
    const existing = useStore.getState().project.media.find((m) => m.path === path);
    if (existing) { added.push(existing); continue; }
    const info = type === 'image' ? { duration: 0, width: 0, height: 0, hasAudio: false } : await api().probe(path);
    const media = {
      id: uid(),
      name: path.split(/[\\/]/).pop(),
      path,
      type: type === 'video' && !info.hasVideo && info.hasAudio ? 'audio' : type,
      duration: info.duration || 0,
      width: info.width || 0,
      height: info.height || 0,
      hasAudio: !!info.hasAudio,
    };
    store.addMedia(media);
    added.push(media);
    prepareMedia(media);
  }
  if (skipped) store.showToast(`${skipped} file${skipped > 1 ? 's were' : ' was'} skipped (not a video, sound or picture)`, 'warn');
  else if (added.length) store.showToast(`Added ${added.length} file${added.length > 1 ? 's' : ''}`);
  if (place) {
    // First import into an empty project: lay the clips out one after another automatically.
    let at = 0;
    for (const m of added) {
      useStore.getState().placeMedia(m.id, at);
      const clips = useStore.getState().project.clips;
      at = Math.max(at, ...clips.map((c) => c.start + c.duration));
    }
  }
  return added;
}

export async function importDialog() {
  const paths = await api().importDialog();
  if (!paths.length) return;
  const empty = !useStore.getState().project.clips.length;
  await importPaths(paths, { place: empty });
}
