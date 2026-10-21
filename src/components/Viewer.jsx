import { useEffect, useRef, useState } from 'react';
import { useStore, useTime } from '../store';
import { projectDuration, formatTime, evalProp, writeProp } from '../model';
import { setPreviewCanvas, setPreviewQuality, togglePlay, seek, stepFrames, snapshotDataUrl, previewSources } from '../playback';
import { activeVisualClips, clipState, contentSize } from '../render';
import { IconButton, Icon } from './ui';
import { importDialog } from '../media';

const measureCtx = document.createElement('canvas').getContext('2d');

// Where a clip sits on screen (project pixels), ignoring rotation for hit-testing.
function clipBox(project, clip, t) {
  const size = contentSize(clip, previewSources, project.width, project.height, measureCtx);
  if (!size) return null;
  const s = clipState(clip, t, project.width, project.height);
  const w = size.w * s.scale, h = size.h * s.scale;
  return { cx: project.width / 2 + s.x, cy: project.height / 2 + s.y, w, h, rot: s.rotation };
}

function SelectionBox({ display, project, clip }) {
  const t = useTime((s) => s.t);
  if (!clip || t < clip.start || t >= clip.start + clip.duration) return null;
  const b = clipBox(project, clip, t);
  if (!b) return null;
  const k = display.scale;
  return (
    <div className="sel-box" style={{
      left: display.x + b.cx * k, top: display.y + b.cy * k, width: b.w * k, height: b.h * k,
      transform: `translate(-50%, -50%) rotate(${b.rot}deg)`,
    }}>
      {['nw', 'ne', 'sw', 'se'].map((c) => <span key={c} className={`handle ${c}`} data-handle={c} />)}
    </div>
  );
}

export default function Viewer() {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const project = useStore((s) => s.project);
  const selection = useStore((s) => s.selection);
  const t = useTime((s) => s.t);
  const playing = useTime((s) => s.playing);
  const [quality, setQuality] = useState(0.5);
  const [display, setDisplay] = useState({ x: 0, y: 0, scale: 1, w: 0, h: 0 });
  const duration = projectDuration(project);

  useEffect(() => { setPreviewCanvas(canvasRef.current); return () => setPreviewCanvas(null); }, []);
  useEffect(() => { setPreviewQuality(quality); }, [quality]);

  // Fit the frame inside the available space.
  useEffect(() => {
    const el = wrapRef.current;
    const fit = () => {
      const r = el.getBoundingClientRect();
      const scale = Math.min((r.width - 24) / project.width, (r.height - 24) / project.height);
      const w = project.width * scale, h = project.height * scale;
      setDisplay({ x: (r.width - w) / 2, y: (r.height - h) / 2, scale, w, h });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [project.width, project.height]);

  const selectedClip = selection.length === 1 ? project.clips.find((c) => c.id === selection[0] && c.type !== 'audio') : null;

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    const r = wrapRef.current.getBoundingClientRect();
    const px = (e.clientX - r.left - display.x) / display.scale;
    const py = (e.clientY - r.top - display.y) / display.scale;
    const st = useStore.getState();
    const now = useTime.getState().t;
    const handle = e.target.dataset?.handle;
    let clip = selectedClip;
    if (!handle) {
      // Click picks the top-most visible clip under the mouse.
      const hits = activeVisualClips(project, now).filter((c) => {
        const tr = project.tracks.find((x) => x.id === c.trackId);
        if (tr?.locked) return false;
        const b = clipBox(project, c, now);
        return b && Math.abs(px - b.cx) <= b.w / 2 && Math.abs(py - b.cy) <= b.h / 2;
      });
      clip = hits[hits.length - 1] || null;
      st.select(clip ? [clip.id] : []);
      if (!clip) return;
    }
    const b = clipBox(project, clip, now);
    if (!b) return;
    const lt = now - clip.start;
    const x0 = evalProp(clip.props.x, lt);
    const y0 = evalProp(clip.props.y, lt);
    const scale0 = evalProp(clip.props.scale, lt);
    const dist0 = Math.hypot(px - b.cx, py - b.cy) || 1;
    let started = false;
    const move = (ev) => {
      const mx = (ev.clientX - r.left - display.x) / display.scale;
      const my = (ev.clientY - r.top - display.y) / display.scale;
      if (!started) { started = true; st.beginGesture(); }
      if (handle) {
        const ratio = Math.hypot(mx - b.cx, my - b.cy) / dist0;
        st.setProp(clip.id, 'scale', Math.round(scale0 * ratio * 10) / 10, true);
      } else {
        let nx = x0 + (mx - px), ny = y0 + (my - py);
        // Snap to the centre lines, which beginners nearly always want.
        const snap = 10 / display.scale;
        if (Math.abs(nx) < snap) nx = 0;
        if (Math.abs(ny) < snap) ny = 0;
        useStore.getState().gesture((p) => {
          const c = p.clips.find((x) => x.id === clip.id);
          writeProp(c.props.x, lt, Math.round(nx));
          writeProp(c.props.y, lt, Math.round(ny));
        });
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (started) st.endGesture();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const snapshot = async () => {
    const out = await window.editsaq.saveFileDialog({
      title: 'Save picture of this frame', defaultName: `${project.name} frame.png`, filters: [{ name: 'PNG picture', extensions: ['png'] }],
    });
    if (!out) return;
    await window.editsaq.writeDataUrl({ filePath: out, dataUrl: snapshotDataUrl() });
    useStore.getState().showToast('Picture saved');
  };

  return (
    <div className="viewer">
      <div className="viewer-stage" ref={wrapRef} onPointerDown={onPointerDown}>
        <canvas ref={canvasRef} className="viewer-canvas" style={{ left: display.x, top: display.y, width: display.w, height: display.h }} />
        <SelectionBox display={display} project={project} clip={selectedClip} />
        {!project.clips.length && (
          <div className="viewer-empty">
            <Icon name="film" size={40} />
            <h3>Let's make a video</h3>
            <p>Start by adding your videos, music or pictures.</p>
            <button className="primary-btn big" onClick={(e) => { e.stopPropagation(); importDialog(); }} onPointerDown={(e) => e.stopPropagation()}>
              <Icon name="plus" /> Add files
            </button>
            <small>Tip: you can also drag files from a folder straight into EditSaq.</small>
          </div>
        )}
      </div>
      <div className="transport">
        <div className="timecode" title="Current time / total length">
          <b>{formatTime(t, project.fps)}</b> <span>/ {formatTime(duration, project.fps)}</span>
        </div>
        <div className="transport-btns">
          <IconButton icon="start" label="Go to start" shortcut="Home" onClick={() => seek(0)} />
          <IconButton icon="prev" label="Back one frame" shortcut="←" onClick={() => stepFrames(-1)} />
          <button className="play-btn" onClick={togglePlay} title={playing ? 'Pause (Space)' : 'Play (Space)'} aria-label={playing ? 'Pause' : 'Play'}>
            <Icon name={playing ? 'pause' : 'play'} size={22} />
          </button>
          <IconButton icon="next" label="Forward one frame" shortcut="→" onClick={() => stepFrames(1)} />
          <IconButton icon="end" label="Go to end" shortcut="End" onClick={() => seek(duration)} />
        </div>
        <div className="transport-right">
          <select value={quality} onChange={(e) => setQuality(parseFloat(e.target.value))} title="Preview quality: lower is smoother on slow computers. Does not affect the export.">
            <option value={1}>Preview: Full</option>
            <option value={0.5}>Preview: Half</option>
            <option value={0.25}>Preview: Quarter</option>
          </select>
          <IconButton icon="camera" label="Save this frame as a picture" onClick={snapshot} />
        </div>
      </div>
    </div>
  );
}
