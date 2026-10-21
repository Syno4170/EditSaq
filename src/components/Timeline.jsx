import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore, useTime, useMediaCache } from '../store';
import { clipEnd, projectDuration, withLinked, resolveOverlaps, formatTime, trackOf } from '../model';
import { seek, pause } from '../playback';
import { importPaths } from '../media';
import { Icon, IconButton } from './ui';

const HEAD_W = 196;
const RULER_H = 30;
const rowHeight = (kind) => (kind === 'video' ? 66 : 54);

const TYPE_LABEL = { video: 'Video', audio: 'Sound', image: 'Picture', text: 'Text', shape: 'Shape', solid: 'Color' };

function niceInterval(zoom) {
  const steps = [1 / 30, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  return steps.find((s) => s * zoom >= 70) || 600;
}

function Waveform({ peaks, clip, width, height }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !peaks?.length) return;
    const cw = Math.max(1, Math.min(4000, Math.round(width)));
    c.width = cw;
    c.height = height;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, cw, height);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    const mid = height / 2;
    for (let i = 0; i < cw; i++) {
      const st = clip.in + (i / cw) * clip.duration * clip.speed;
      const v = (peaks[Math.floor(st * 100)] || 0) / 255;
      const h = Math.max(0.5, v * mid * (clip.volume / 100));
      ctx.fillRect(i, mid - h, 1, h * 2);
    }
  }, [peaks, clip.in, clip.duration, clip.speed, clip.volume, width, height]);
  return <canvas ref={ref} className="wave" style={{ width, height }} />;
}

function Clip({ clip, zoom, selected, height, onPointerDown }) {
  const cache = useMediaCache((s) => (clip.mediaId ? s[clip.mediaId] : null));
  const left = clip.start * zoom;
  const width = Math.max(2, clip.duration * zoom);
  const showThumb = (clip.type === 'video' || clip.type === 'image') && cache?.thumb;
  const kfTimes = useMemo(() => {
    if (!selected) return [];
    const s = new Set();
    for (const p of Object.values(clip.props)) for (const k of p.kf) s.add(Math.round(k.t * 1000) / 1000);
    return [...s].filter((t) => t >= 0 && t <= clip.duration);
  }, [clip.props, clip.duration, selected]);
  const label = clip.type === 'text' ? clip.text.content.split('\n')[0] || 'Text' : clip.name || TYPE_LABEL[clip.type];
  return (
    <div
      className={`clip clip-${clip.type} ${selected ? 'selected' : ''} ${cache?.status === 'missing' ? 'missing' : ''}`}
      style={{ left, width, height: height - 8 }}
      onPointerDown={(e) => onPointerDown(e, clip)}
      title={`${label}\n${TYPE_LABEL[clip.type]} · ${clip.duration.toFixed(2)}s${clip.speed !== 1 ? ` · speed ${clip.speed}x` : ''}\nDrag to move · drag the edges to shorten`}
    >
      {showThumb && <div className="clip-thumbs" style={{ backgroundImage: `url(${cache.thumb})` }} />}
      {clip.type === 'audio' && cache?.peaks && <Waveform peaks={cache.peaks} clip={clip} width={width} height={height - 24} />}
      <div className="clip-label">
        {clip.linkId && <Icon name="link" size={11} />}
        <span>{label}</span>
        {clip.speed !== 1 && <b className="clip-badge">{clip.speed}x</b>}
      </div>
      {clip.transIn && <div className="trans-mark in" style={{ width: Math.min(width / 2, clip.transIn.dur * zoom) }} title={`Transition in: ${clip.transIn.type}`} />}
      {clip.transOut && <div className="trans-mark out" style={{ width: Math.min(width / 2, clip.transOut.dur * zoom) }} title={`Transition out: ${clip.transOut.type}`} />}
      {clip.type === 'audio' && clip.audioFadeIn > 0 && <div className="fade-mark in" style={{ width: clip.audioFadeIn * zoom }} />}
      {clip.type === 'audio' && clip.audioFadeOut > 0 && <div className="fade-mark out" style={{ width: clip.audioFadeOut * zoom }} />}
      {kfTimes.map((t) => <span key={t} className="kf-dot" style={{ left: t * zoom }} />)}
      <div className="trim-handle left" />
      <div className="trim-handle right" />
    </div>
  );
}

function Playhead({ zoom, scrollRef }) {
  const t = useTime((s) => s.t);
  const playing = useTime((s) => s.playing);
  const x = HEAD_W + t * zoom;
  // Keep the playhead on screen while playing.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !playing) return;
    const viewL = el.scrollLeft + HEAD_W;
    const viewR = el.scrollLeft + el.clientWidth - 40;
    if (x > viewR || x < viewL) el.scrollLeft = x - HEAD_W - 40;
  }, [x, playing, scrollRef]);
  return (
    <div className="playhead" style={{ left: x }}>
      <div className="playhead-cap" />
    </div>
  );
}

function Ruler({ zoom, width, onSeekStart, markers }) {
  const iv = niceInterval(zoom);
  const fps = useStore((s) => s.project.fps);
  const labels = [];
  const count = Math.ceil(width / zoom / iv) + 1;
  for (let i = 0; i < count; i++) {
    const t = i * iv;
    labels.push(<span key={i} className="ruler-label" style={{ left: t * zoom }}>{iv < 1 ? formatTime(t, fps) : formatTime(t, fps, false)}</span>);
  }
  return (
    <div className="ruler-row">
      <div className="ruler-corner">Time</div>
      <div
        className="ruler"
        style={{ width, backgroundSize: `${(iv * zoom) / 5}px 100%, ${iv * zoom}px 100%` }}
        onPointerDown={onSeekStart}
        title="Click or drag here to move through your video"
      >
        {labels}
        {markers.map((m) => <span key={m.id} className="marker" style={{ left: m.t * zoom }} title="Marker" />)}
      </div>
    </div>
  );
}

export default function Timeline() {
  const project = useStore((s) => s.project);
  const selection = useStore((s) => s.selection);
  const zoom = useStore((s) => s.zoom);
  const tool = useStore((s) => s.tool);
  const snapping = useStore((s) => s.snapping);
  const mode = useStore((s) => s.mode);
  const store = useStore.getState;
  const scrollRef = useRef(null);
  const [dropTrack, setDropTrack] = useState(null);
  const [snapLine, setSnapLine] = useState(null);

  const duration = projectDuration(project);
  const contentW = (Math.max(duration, 30) + 30) * zoom;
  const selSet = useMemo(() => new Set(selection), [selection]);
  // Video tracks are listed bottom-up in the project, shown top-down like Premiere.
  const rows = useMemo(() => {
    const v = project.tracks.filter((t) => t.kind === 'video').reverse();
    const a = project.tracks.filter((t) => t.kind === 'audio');
    return [...v, ...a];
  }, [project.tracks]);

  const timeAt = (clientX) => {
    const el = scrollRef.current;
    const r = el.getBoundingClientRect();
    return Math.max(0, (clientX - r.left + el.scrollLeft - HEAD_W) / zoom);
  };

  const snapPoints = (exclude) => {
    const pts = [0, useTime.getState().t, ...project.markers.map((m) => m.t)];
    for (const c of project.clips) if (!exclude.has(c.id)) pts.push(c.start, clipEnd(c));
    return pts;
  };
  const snapTime = (t, pts) => {
    if (!snapping) return { t, hit: null };
    const thr = 8 / zoom;
    let best = null;
    for (const p of pts) if (Math.abs(p - t) < thr && (best === null || Math.abs(p - t) < Math.abs(best - t))) best = p;
    return best === null ? { t, hit: null } : { t: best, hit: best };
  };

  // Ctrl + mouse wheel zooms around the mouse pointer.
  useEffect(() => {
    const el = scrollRef.current;
    const onWheel = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const z = useStore.getState().zoom;
      const t = timeAt(e.clientX);
      const nz = Math.max(4, Math.min(1200, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      useStore.setState({ zoom: nz });
      requestAnimationFrame(() => { el.scrollLeft += t * nz - t * z; });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const onSeekStart = (e) => {
    pause();
    seek(timeAt(e.clientX));
    const move = (ev) => seek(timeAt(ev.clientX));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onClipPointerDown = (e, clip) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const track = trackOf(project, clip.trackId);
    if (track?.locked) { store().showToast('This track is locked. Click the lock icon to unlock it.'); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const offX = e.clientX - rect.left;

    if (tool === 'razor') {
      let t = timeAt(e.clientX);
      t = Math.round(t * project.fps) / project.fps;
      if (snapping) t = snapTime(t, snapPoints(new Set())).t;
      store().splitClips([clip.id], t);
      return;
    }

    const additive = e.ctrlKey || e.shiftKey;
    let sel = selection;
    if (additive) { store().select([clip.id], true); sel = useStore.getState().selection; }
    else if (!selSet.has(clip.id)) { store().select([clip.id]); sel = [clip.id]; }
    if (additive && !sel.includes(clip.id)) return;

    const edge = offX < 8 && rect.width > 20 ? 'start' : rect.width - offX < 8 && rect.width > 20 ? 'end' : null;
    const group = withLinked(project, edge ? [clip.id] : sel.includes(clip.id) ? sel : [clip.id]);
    const orig = new Map(project.clips.filter((c) => group.has(c.id)).map((c) => [c.id, { ...c }]));
    const pts = snapPoints(group);
    const kindTracks = (kind) => project.tracks.filter((t) => t.kind === kind);
    const startX = e.clientX;
    let started = false;

    const move = (ev) => {
      const dx = ev.clientX - startX;
      if (!started) {
        if (Math.abs(dx) < 3 && Math.abs(ev.clientY - e.clientY) < 3) return;
        started = true;
        store().beginGesture();
      }
      let dt = dx / zoom;
      if (edge) {
        const o = orig.get(clip.id);
        const raw = (edge === 'start' ? o.start : clipEnd(o)) + dt;
        const s = snapTime(raw, pts);
        setSnapLine(s.hit);
        dt = s.t - (edge === 'start' ? o.start : clipEnd(o));
        store().gesture((p) => {
          for (const c of p.clips) {
            if (!group.has(c.id)) continue;
            const oc = orig.get(c.id);
            const media = p.media.find((m) => m.id === c.mediaId);
            store().trimClip(p, c, edge, (edge === 'start' ? oc.start : clipEnd(oc)) + dt, media);
          }
          resolveOverlaps(p, group);
        });
        return;
      }
      // Moving: snap whichever edge of the grabbed clip is closest to a snap point.
      const o = orig.get(clip.id);
      const sA = snapTime(o.start + dt, pts);
      const sB = snapTime(clipEnd(o) + dt, pts);
      if (sA.hit !== null && (sB.hit === null || Math.abs(sA.t - (o.start + dt)) <= Math.abs(sB.t - (clipEnd(o) + dt)))) { dt = sA.t - o.start; setSnapLine(sA.hit); }
      else if (sB.hit !== null) { dt = sB.t - clipEnd(o); setSnapLine(sB.hit); }
      else setSnapLine(null);
      const minStart = Math.min(...[...orig.values()].map((c) => c.start));
      dt = Math.max(dt, -minStart);
      // Moving up/down between tracks of the same kind.
      let dIdx = 0;
      const hover = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-track-id]');
      if (hover) {
        const ht = trackOf(project, hover.dataset.trackId);
        if (ht && ht.kind === track.kind) {
          const list = kindTracks(track.kind);
          dIdx = list.findIndex((t) => t.id === ht.id) - list.findIndex((t) => t.id === clip.trackId);
        }
      }
      const newTrack = (c) => {
        if (!dIdx || trackOf(project, c.trackId).kind !== track.kind) return c.trackId;
        const list = kindTracks(track.kind);
        const ni = list.findIndex((t) => t.id === c.trackId) + dIdx;
        return ni >= 0 && ni < list.length && !list[ni].locked ? list[ni].id : null;
      };
      const allFit = [...orig.values()].every((c) => newTrack(c) !== null);
      store().gesture((p) => {
        for (const c of p.clips) {
          if (!group.has(c.id)) continue;
          const oc = orig.get(c.id);
          c.start = oc.start + dt;
          if (allFit) c.trackId = newTrack(oc);
        }
        resolveOverlaps(p, group);
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setSnapLine(null);
      if (started) store().endGesture();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onLaneDown = (e) => {
    if (e.button !== 0) return;
    store().select([]);
    onSeekStart(e);
  };

  const onDrop = async (e, trackId) => {
    e.preventDefault();
    setDropTrack(null);
    const t = timeAt(e.clientX);
    const mediaId = e.dataTransfer.getData('editsaq/media');
    const graphic = e.dataTransfer.getData('editsaq/graphic');
    if (mediaId) { store().placeMedia(mediaId, t, trackId); return; }
    if (graphic) {
      const g = JSON.parse(graphic);
      const tr = trackOf(project, trackId);
      store().addGraphic(g.kind, g.preset, t, tr.kind === 'video' ? trackId : null);
      return;
    }
    const files = [...e.dataTransfer.files].map((f) => window.editsaq.pathForFile(f)).filter(Boolean);
    if (files.length) {
      const added = await importPaths(files);
      let at = t;
      for (const m of added) {
        store().placeMedia(m.id, at, trackId);
        at += m.type === 'image' ? 5 : m.duration || 5;
      }
    }
  };

  const fit = () => {
    const el = scrollRef.current;
    if (!el || duration <= 0) return;
    useStore.setState({ zoom: Math.max(4, Math.min(1200, (el.clientWidth - HEAD_W - 60) / duration)) });
    el.scrollLeft = 0;
  };

  useLayoutEffect(() => {
    const onFit = () => fit();
    window.addEventListener('editsaq:fit', onFit);
    return () => window.removeEventListener('editsaq:fit', onFit);
  });

  const toggleTrack = (id, key) => store().updateProject((p) => { const t = p.tracks.find((x) => x.id === id); t[key] = !t[key]; });

  return (
    <div className="timeline">
      <div className="tl-toolbar">
        <div className="tool-group">
          <IconButton icon="cursor" label="Select & move tool" shortcut="V" active={tool === 'select'} onClick={() => useStore.setState({ tool: 'select' })}>
            <span>Select</span>
          </IconButton>
          <IconButton icon="scissors" label="Cut tool: click on a clip to cut it there" shortcut="C" active={tool === 'razor'} onClick={() => useStore.setState({ tool: 'razor' })}>
            <span>Cut tool</span>
          </IconButton>
        </div>
        <div className="tool-group">
          <IconButton icon="scissors" label="Split the clip at the playhead (red line)" shortcut="S" onClick={() => store().splitAtPlayhead()}><span>Split here</span></IconButton>
          <IconButton icon="trash" label="Delete selected clip" shortcut="Delete" disabled={!selection.length} onClick={() => store().deleteSelection()}><span>Delete</span></IconButton>
          <IconButton icon="copy" label="Duplicate selected clip" shortcut="Ctrl+D" disabled={!selection.length} onClick={() => store().duplicateSelection()} />
          {mode === 'advanced' && <IconButton icon="unlink" label="Unlink video and sound so you can move them separately" disabled={!selection.length} onClick={() => store().unlinkSelection()} />}
          <IconButton icon="marker" label="Add a marker at the playhead" shortcut="M" onClick={() => store().addMarker()} />
        </div>
        <div className="tool-group">
          <IconButton icon="magnet" label={snapping ? 'Snapping is on: clips stick together' : 'Snapping is off'} active={snapping} onClick={() => useStore.setState({ snapping: !snapping })} />
        </div>
        <div className="tl-spacer" />
        <div className="tool-group">
          <IconButton icon="zoomOut" label="Zoom out" shortcut="-" onClick={() => useStore.setState({ zoom: Math.max(4, zoom / 1.4) })} />
          <input className="slider zoom-slider" type="range" min={Math.log(4)} max={Math.log(1200)} step={0.01} value={Math.log(zoom)}
            style={{ '--p': `${((Math.log(zoom) - Math.log(4)) / (Math.log(1200) - Math.log(4))) * 100}%` }}
            onChange={(e) => useStore.setState({ zoom: Math.exp(parseFloat(e.target.value)) })} title="Zoom the timeline" />
          <IconButton icon="zoomIn" label="Zoom in" shortcut="+" onClick={() => useStore.setState({ zoom: Math.min(1200, zoom * 1.4) })} />
          <button className="text-btn" onClick={fit} title="Show the whole video">Fit</button>
        </div>
      </div>

      <div className="tl-scroll" ref={scrollRef}>
        <div className="tl-content" style={{ width: contentW + HEAD_W }}>
          <Ruler zoom={zoom} width={contentW} onSeekStart={onSeekStart} markers={project.markers} />
          {rows.map((tr) => {
            const h = rowHeight(tr.kind);
            const clips = project.clips.filter((c) => c.trackId === tr.id);
            return (
              <div key={tr.id} className={`track-row ${tr.kind} ${dropTrack === tr.id ? 'drop' : ''} ${tr.locked ? 'locked' : ''}`} style={{ height: h }} data-track-id={tr.id}>
                <div className="track-head" style={{ width: HEAD_W }}>
                  <Icon name={tr.kind === 'video' ? 'film' : 'music'} size={14} className="track-kind" />
                  <input className="track-name" value={tr.name} onChange={(e) => store().updateProject((p) => { p.tracks.find((x) => x.id === tr.id).name = e.target.value; })} />
                  <div className="track-btns">
                    {tr.kind === 'video'
                      ? <IconButton icon={tr.hidden ? 'eyeOff' : 'eye'} size={14} label={tr.hidden ? 'Show this track' : 'Hide this track'} active={tr.hidden} onClick={() => toggleTrack(tr.id, 'hidden')} />
                      : <IconButton icon={tr.muted ? 'mute' : 'volume'} size={14} label={tr.muted ? 'Unmute this track' : 'Mute this track'} active={tr.muted} onClick={() => toggleTrack(tr.id, 'muted')} />}
                    <IconButton icon={tr.locked ? 'lock' : 'unlock'} size={14} label={tr.locked ? 'Unlock track' : 'Lock track (stops accidental changes)'} active={tr.locked} onClick={() => toggleTrack(tr.id, 'locked')} />
                    {mode === 'advanced' && <IconButton icon="trash" size={14} label="Remove this track" onClick={() => store().removeTrack(tr.id)} />}
                  </div>
                </div>
                <div
                  className="lane"
                  style={{ width: contentW }}
                  onPointerDown={onLaneDown}
                  onDragOver={(e) => { e.preventDefault(); setDropTrack(tr.id); }}
                  onDragLeave={() => setDropTrack((d) => (d === tr.id ? null : d))}
                  onDrop={(e) => onDrop(e, tr.id)}
                >
                  {clips.map((c) => <Clip key={c.id} clip={c} zoom={zoom} height={h} selected={selSet.has(c.id)} onPointerDown={onClipPointerDown} />)}
                </div>
              </div>
            );
          })}
          <div className="add-track-row">
            <div className="track-head" style={{ width: HEAD_W }}>
              <button className="text-btn small" onClick={() => store().addTrack('video')} title="Add another video layer"><Icon name="plus" size={13} /> Video track</button>
              <button className="text-btn small" onClick={() => store().addTrack('audio')} title="Add another sound layer"><Icon name="plus" size={13} /> Sound track</button>
            </div>
          </div>
          <Playhead zoom={zoom} scrollRef={scrollRef} />
          {snapLine !== null && <div className="snap-line" style={{ left: HEAD_W + snapLine * zoom }} />}
          {!project.clips.length && (
            <div className="tl-empty" style={{ left: HEAD_W + 24 }}>
              <Icon name="film" size={22} />
              <div>
                <b>Your timeline is empty</b>
                <span>Drag videos, music or pictures here from <em>My files</em> on the left, or straight from a folder on your computer.</span>
              </div>
            </div>
          )}
        </div>
      </div>
      {tool === 'razor' && <div className="tool-hint">Cut tool is on: click a clip to cut it. Press <kbd>V</kbd> to go back to normal.</div>}
    </div>
  );
}

export { HEAD_W, RULER_H };
