import { create } from 'zustand';
import { produce } from 'immer';
import {
  newProject, makeClip, uid, defaultText, defaultShape, clipEnd, projectDuration, withLinked, splitClip,
  resolveOverlaps, shiftKeyframes, writeProp, kfAt, KF_EPS, ANIM_PROPS, trackOf, mediaOf,
} from './model';

// Playhead time lives in its own tiny store so 60fps updates don't re-render the whole app.
export const useTime = create(() => ({ t: 0, playing: false }));

// Thumbnails, waveforms and playable paths: derived from files, not saved and not part of undo.
export const useMediaCache = create(() => ({}));
export const patchCache = (id, patch) => useMediaCache.setState((s) => ({ [id]: { ...s[id], ...patch } }));

let gestureBase = null;
let clipboard = [];
let toastTimer = null;

export const useStore = create((set, get) => {
  // Apply a change to the project and record it for undo.
  const commit = (fn) => {
    const prev = get().project;
    const next = produce(prev, fn);
    if (next === prev) return;
    set({ project: next, past: [...get().past.slice(-150), prev], future: [], dirty: true });
  };

  const now = () => useTime.getState().t;

  return {
    project: newProject(),
    filePath: null,
    dirty: false,
    past: [],
    future: [],
    selection: [],
    tool: 'select',
    snapping: true,
    zoom: 80, // pixels per second
    mode: 'simple', // simple | advanced
    leftTab: 'media',
    welcome: true,
    exportOpen: false,
    settingsOpen: false,
    helpOpen: false,
    toast: null,

    commit,
    set: (patch) => set(patch),

    showToast(msg, kind = 'info') {
      clearTimeout(toastTimer);
      set({ toast: { msg, kind } });
      toastTimer = setTimeout(() => set({ toast: null }), 3500);
    },

    // ----- drag gestures: many updates, one undo step -----
    beginGesture() { gestureBase = get().project; },
    gesture(fn) {
      if (gestureBase) set({ project: produce(gestureBase, fn) });
      else commit(fn); // e.g. keyboard-driven slider change without a drag
    },
    endGesture() {
      const base = gestureBase;
      gestureBase = null;
      if (base && get().project !== base) set({ past: [...get().past.slice(-150), base], future: [], dirty: true });
    },

    undo() {
      const { past, project, future } = get();
      if (!past.length) return;
      set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future], dirty: true });
    },
    redo() {
      const { past, project, future } = get();
      if (!future.length) return;
      set({ project: future[0], future: future.slice(1), past: [...past, project], dirty: true });
    },

    // ----- project -----
    newProject(opts) {
      set({ project: newProject(opts), filePath: null, dirty: false, past: [], future: [], selection: [], welcome: false });
      useTime.setState({ t: 0, playing: false });
    },
    loadProject(project, filePath) {
      set({ project, filePath, dirty: false, past: [], future: [], selection: [], welcome: false });
      useTime.setState({ t: 0, playing: false });
    },
    updateProject(fn) { commit(fn); },

    // ----- media -----
    addMedia(media) { commit((p) => { p.media.push(media); }); },
    updateMediaInfo(id, patch) {
      // metadata fix-ups after probing shouldn't create undo steps
      set({ project: produce(get().project, (p) => { const m = p.media.find((x) => x.id === id); if (m) Object.assign(m, patch); }) });
    },
    removeMedia(id) {
      commit((p) => {
        p.media = p.media.filter((m) => m.id !== id);
        p.clips = p.clips.filter((c) => c.mediaId !== id);
      });
      set({ selection: get().selection.filter((cid) => get().project.clips.some((c) => c.id === cid)) });
    },

    // Put a media file on the timeline. Videos with sound get a linked sound clip.
    placeMedia(mediaId, at = null, trackId = null) {
      const { project } = get();
      const media = project.media.find((m) => m.id === mediaId);
      if (!media) return;
      const start = at ?? now();
      const vTracks = project.tracks.filter((t) => t.kind === 'video' && !t.locked);
      const aTracks = project.tracks.filter((t) => t.kind === 'audio' && !t.locked);
      const created = [];
      commit((p) => {
        const linkId = media.type === 'video' && media.hasAudio ? uid() : null;
        if (media.type === 'video' || media.type === 'image') {
          const track = trackId && trackOf(p, trackId)?.kind === 'video' ? trackId : vTracks[0]?.id;
          if (!track) return;
          const c = makeClip(media.type, {
            trackId: track, mediaId, name: media.name, start,
            duration: media.type === 'image' ? 5 : media.duration || 5, linkId,
          });
          p.clips.push(c);
          created.push(c.id);
          if (linkId) {
            const aTrack = aTracks[0]?.id;
            if (aTrack) {
              const a = makeClip('audio', { trackId: aTrack, mediaId, name: media.name, start, duration: c.duration, linkId });
              p.clips.push(a);
              created.push(a.id);
            }
          }
        } else if (media.type === 'audio') {
          const track = trackId && trackOf(p, trackId)?.kind === 'audio' ? trackId : aTracks[aTracks.length > 1 ? 1 : 0]?.id;
          if (!track) return;
          const a = makeClip('audio', { trackId: track, mediaId, name: media.name, start, duration: media.duration || 5 });
          p.clips.push(a);
          created.push(a.id);
        }
        resolveOverlaps(p, new Set(created));
      });
      set({ selection: created.slice(0, 1) });
      return created;
    },

    // Titles, shapes and color backgrounds.
    addGraphic(kind, preset = {}, at = null, trackId = null) {
      const { project } = get();
      const vTracks = project.tracks.filter((t) => t.kind === 'video' && !t.locked);
      const track = trackId || vTracks[vTracks.length - 1]?.id;
      if (!track) return;
      let clip;
      if (kind === 'text') clip = makeClip('text', { name: 'Text', text: { ...defaultText(), ...preset.text } });
      else if (kind === 'shape') clip = makeClip('shape', { name: preset.shape?.kind === 'ellipse' ? 'Circle' : 'Box', shape: { ...defaultShape(), ...preset.shape } });
      else clip = makeClip('solid', { name: 'Color', color: preset.color || '#1e3a8a' });
      clip.trackId = track;
      clip.start = at ?? now();
      clip.duration = preset.duration || 5;
      if (preset.props) for (const [k, v] of Object.entries(preset.props)) clip.props[k].v = v;
      if (preset.transIn) clip.transIn = preset.transIn;
      if (preset.transOut) clip.transOut = preset.transOut;
      if (preset.name) clip.name = preset.name;
      commit((p) => { p.clips.push(clip); resolveOverlaps(p, new Set([clip.id])); });
      set({ selection: [clip.id] });
    },

    // ----- selection & clip editing -----
    select(ids, additive = false) {
      const cur = get().selection;
      if (additive) {
        const s = new Set(cur);
        for (const id of ids) s.has(id) ? s.delete(id) : s.add(id);
        set({ selection: [...s] });
      } else set({ selection: ids });
    },

    updateClip(id, fn) {
      commit((p) => { const c = p.clips.find((x) => x.id === id); if (c) fn(c, p); });
    },
    updateClips(ids, fn) {
      commit((p) => { for (const c of p.clips) if (ids.includes(c.id)) fn(c, p); });
    },

    // Set an animatable property at the playhead (adds a keyframe if the property is animated).
    setProp(clipId, key, value, gesture = false) {
      const apply = (p) => {
        const c = p.clips.find((x) => x.id === clipId);
        if (!c) return;
        const d = ANIM_PROPS[key];
        let v = value;
        if (d.min !== undefined) v = Math.max(d.min, v);
        if (d.max !== undefined) v = Math.min(d.max, v);
        writeProp(c.props[key], now() - c.start, v);
      };
      gesture ? get().gesture(apply) : commit(apply);
    },
    // Stopwatch: turn animation on (first keyframe at playhead) or off (keep current value).
    toggleAnimate(clipId, key) {
      commit((p) => {
        const c = p.clips.find((x) => x.id === clipId);
        const prop = c.props[key];
        const t = now() - c.start;
        if (prop.kf.length) {
          const k = kfAt(prop, t);
          prop.v = k ? k.v : prop.kf[0].v;
          prop.kf = [];
        } else {
          prop.kf = [{ t: Math.max(0, Math.min(c.duration, t)), v: prop.v, ease: 'ease' }];
        }
      });
    },
    toggleKeyframe(clipId, key, currentValue) {
      commit((p) => {
        const c = p.clips.find((x) => x.id === clipId);
        const prop = c.props[key];
        const t = now() - c.start;
        const k = kfAt(prop, t);
        if (k) prop.kf.splice(prop.kf.indexOf(k), 1);
        else { prop.kf.push({ t, v: currentValue, ease: 'ease' }); prop.kf.sort((a, b) => a.t - b.t); }
      });
    },
    setKeyframeEase(clipId, key, ease) {
      commit((p) => {
        const c = p.clips.find((x) => x.id === clipId);
        const k = kfAt(c.props[key], now() - c.start);
        if (k) k.ease = ease;
      });
    },

    splitAtPlayhead() {
      const t = now();
      const { project, selection } = get();
      const under = project.clips.filter((c) => c.start < t - 0.01 && clipEnd(c) > t + 0.01 && !trackOf(project, c.trackId)?.locked);
      const selUnder = under.filter((c) => withLinked(project, selection).has(c.id));
      const targets = selUnder.length ? selUnder : under;
      if (!targets.length) { get().showToast('Move the playhead over a clip to cut it'); return; }
      get().splitClips(targets.map((c) => c.id), t);
    },
    splitClips(ids, t) {
      const linkMap = {};
      commit((p) => {
        const set = withLinked(p, ids);
        for (const c of [...p.clips]) {
          if (!set.has(c.id)) continue;
          const right = splitClip(c, t);
          if (!right) continue;
          if (c.linkId) right.linkId = linkMap[c.linkId] ||= uid();
          p.clips.push(right);
        }
      });
    },

    deleteSelection(ripple = false) {
      const { project, selection } = get();
      if (!selection.length) return;
      const ids = withLinked(project, selection);
      commit((p) => {
        const removed = p.clips.filter((c) => ids.has(c.id));
        p.clips = p.clips.filter((c) => !ids.has(c.id));
        if (ripple) {
          // close the gap on every track the removed clips were on
          for (const r of removed) {
            for (const c of p.clips) {
              if (c.trackId === r.trackId && c.start >= clipEnd(r) - 1e-6) c.start -= r.duration;
            }
          }
          for (const c of p.clips) c.start = Math.max(0, c.start);
        }
      });
      set({ selection: [] });
    },

    duplicateSelection() {
      const { project, selection } = get();
      if (!selection.length) return;
      const ids = withLinked(project, selection);
      const src = project.clips.filter((c) => ids.has(c.id));
      const offset = Math.max(...src.map(clipEnd)) - Math.min(...src.map((c) => c.start));
      get().pasteClips(src, Math.min(...src.map((c) => c.start)) + offset);
    },
    copySelection() {
      const { project, selection } = get();
      const ids = withLinked(project, selection);
      clipboard = JSON.parse(JSON.stringify(project.clips.filter((c) => ids.has(c.id))));
      if (clipboard.length) get().showToast(`Copied ${clipboard.length} clip${clipboard.length > 1 ? 's' : ''}`);
    },
    pasteClipboard() { if (clipboard.length) get().pasteClips(clipboard, now()); },
    pasteClips(src, at) {
      const base = Math.min(...src.map((c) => c.start));
      const links = {};
      const fresh = src.map((c) => {
        const n = JSON.parse(JSON.stringify(c));
        n.id = uid();
        n.start = at + (c.start - base);
        if (c.linkId) n.linkId = links[c.linkId] ||= uid();
        return n;
      });
      commit((p) => { p.clips.push(...fresh); resolveOverlaps(p, new Set(fresh.map((c) => c.id))); });
      set({ selection: fresh.map((c) => c.id) });
    },

    unlinkSelection() {
      const { project, selection } = get();
      const ids = withLinked(project, selection);
      commit((p) => { for (const c of p.clips) if (ids.has(c.id)) c.linkId = null; });
    },

    // Trim edges of a clip (used by the timeline handles and "trim to playhead").
    trimClip(p, c, edge, newTime, media) {
      const minDur = 1 / p.fps;
      if (edge === 'start') {
        let d = newTime - c.start;
        d = Math.min(d, c.duration - minDur);
        if (media && (c.type === 'video' || c.type === 'audio')) d = Math.max(d, -c.in / c.speed);
        d = Math.max(d, -c.start);
        c.start += d;
        c.duration -= d;
        if (media && (c.type === 'video' || c.type === 'audio')) c.in += d * c.speed;
        shiftKeyframes(c, -d);
      } else {
        let dur = Math.max(minDur, newTime - c.start);
        if (media && (c.type === 'video' || c.type === 'audio') && media.duration) dur = Math.min(dur, (media.duration - c.in) / c.speed);
        c.duration = dur;
      }
    },

    setSpeed(ids, speed) {
      commit((p) => {
        const set = withLinked(p, ids);
        for (const c of p.clips) {
          if (!set.has(c.id) || (c.type !== 'video' && c.type !== 'audio')) continue;
          const sourceLen = c.duration * c.speed;
          c.speed = speed;
          c.duration = sourceLen / speed;
        }
      });
    },

    addTrack(kind) {
      commit((p) => {
        const n = p.tracks.filter((t) => t.kind === kind).length + 1;
        const t = { id: uid(), kind, name: kind === 'video' ? `Video ${n}` : `Sound ${n}`, hidden: false, locked: false, muted: false };
        if (kind === 'video') {
          const lastV = p.tracks.map((x) => x.kind).lastIndexOf('video');
          p.tracks.splice(lastV + 1, 0, t);
        } else p.tracks.push(t);
      });
    },
    removeTrack(id) {
      const { project } = get();
      const tr = trackOf(project, id);
      if (project.tracks.filter((t) => t.kind === tr.kind).length <= 1) { get().showToast('You need at least one track of each kind'); return; }
      commit((p) => { p.tracks = p.tracks.filter((t) => t.id !== id); p.clips = p.clips.filter((c) => c.trackId !== id); });
    },

    addMarker() {
      const t = now();
      commit((p) => { if (!p.markers.some((m) => Math.abs(m.t - t) < KF_EPS)) p.markers.push({ id: uid(), t, label: '' }); });
    },

    duration() { return projectDuration(get().project); },
    mediaOf(clip) { return mediaOf(get().project, clip); },
  };
});

// Keep the window title and "unsaved changes" prompt in sync.
useStore.subscribe((s, prev) => {
  if (s.dirty !== prev.dirty || s.project.name !== prev.project.name) {
    window.editsaq?.setDirty(s.dirty);
    window.editsaq?.setTitle(`${s.project.name}${s.dirty ? ' •' : ''} — EditSaq`);
  }
});
