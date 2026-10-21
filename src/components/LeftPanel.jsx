import { useState } from 'react';
import { useStore, useMediaCache } from '../store';
import { TRANSITIONS, formatTime, withLinked, makeProps } from '../model';
import { importDialog, importPaths } from '../media';
import { Icon } from './ui';

const TABS = [
  { id: 'media', label: 'My files', icon: 'folder' },
  { id: 'text', label: 'Text', icon: 'text' },
  { id: 'effects', label: 'Effects', icon: 'sparkles' },
  { id: 'transitions', label: 'Transitions', icon: 'transition' },
];

const STATUS = { loading: 'Loading…', converting: 'Preparing for editing…', missing: 'File not found', error: 'Can\'t open this file' };

function MediaTab() {
  const media = useStore((s) => s.project.media);
  const cache = useMediaCache();
  const [over, setOver] = useState(false);
  const st = useStore.getState();
  const onDrop = async (e) => {
    e.preventDefault();
    setOver(false);
    const files = [...e.dataTransfer.files].map((f) => window.editsaq.pathForFile(f)).filter(Boolean);
    if (files.length) await importPaths(files, { place: !useStore.getState().project.clips.length });
  };
  return (
    <div className={`tab-body ${over ? 'drop' : ''}`} onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
      <button className="primary-btn wide" onClick={importDialog}><Icon name="plus" /> Add videos, music & pictures</button>
      {!media.length ? (
        <div className="drop-zone" onClick={importDialog}>
          <Icon name="folder" size={30} />
          <b>Drop files here</b>
          <span>or click to choose them from your computer</span>
        </div>
      ) : (
        <>
          <p className="tab-hint">Drag a file onto the timeline below, or click <b>+</b> to add it at the red line.</p>
          <div className="media-grid">
            {media.map((m) => {
              const c = cache[m.id] || {};
              const busy = c.status && c.status !== 'ready';
              return (
                <div
                  key={m.id}
                  className={`media-card ${c.status === 'missing' || c.status === 'error' ? 'bad' : ''}`}
                  draggable={!busy || c.status === 'loading'}
                  onDragStart={(e) => { e.dataTransfer.setData('editsaq/media', m.id); e.dataTransfer.effectAllowed = 'copy'; }}
                  onDoubleClick={() => st.placeMedia(m.id)}
                  title={`${m.name}\n${m.path}\nDouble-click or drag to the timeline`}
                >
                  <div className="media-thumb">
                    {c.thumb ? <img src={c.thumb} alt="" draggable={false} /> : <Icon name={m.type === 'audio' ? 'music' : m.type === 'image' ? 'image' : 'film'} size={26} />}
                    {m.type !== 'image' && m.duration > 0 && <span className="media-dur">{formatTime(m.duration, 30, false)}</span>}
                    {busy && <span className="media-status">{STATUS[c.status]}</span>}
                    <button className="media-add" title="Add to the timeline at the red line" onClick={(e) => { e.stopPropagation(); st.placeMedia(m.id); }}><Icon name="plus" size={16} /></button>
                  </div>
                  <div className="media-name">
                    <Icon name={m.type === 'audio' ? 'music' : m.type === 'image' ? 'image' : 'film'} size={12} />
                    <span>{m.name}</span>
                    <button className="media-remove" title="Remove from project" onClick={(e) => { e.stopPropagation(); if (confirm(`Remove "${m.name}" and its clips from this project?\n(The file on your computer is not deleted.)`)) st.removeMedia(m.id); }}><Icon name="close" size={12} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

const TEXT_PRESETS = [
  { name: 'Big title', sample: 'Title', style: { fontWeight: 800, fontSize: 22 }, preset: { name: 'Title', text: { content: 'My Video Title', size: 140 }, transIn: { type: 'fade', dur: 0.5 }, transOut: { type: 'fade', dur: 0.5 } } },
  { name: 'Subtitle', sample: 'Subtitle', style: { fontSize: 15 }, preset: { name: 'Subtitle', text: { content: 'A short subtitle', size: 70, bold: false }, props: { y: 120 } } },
  { name: 'Caption', sample: 'Caption', style: { fontSize: 13, background: '#000a', padding: '2px 6px', borderRadius: 4 }, preset: { name: 'Caption', duration: 3, text: { content: 'What people are saying', size: 56, bold: false, shadow: false, bg: '#000000b3', bgPad: 18 }, props: { y: 400 } } },
  { name: 'Name tag', sample: 'Name', style: { fontSize: 13, background: '#2563eb', padding: '2px 6px', borderRadius: 3, fontWeight: 700 }, preset: { name: 'Name tag', text: { content: 'Your Name\nJob title', size: 52, align: 'left', bg: '#2563ebe6', bgPad: 22, shadow: false }, props: { x: -560, y: 360 }, transIn: { type: 'slide-right', dur: 0.5 }, transOut: { type: 'fade', dur: 0.4 } } },
  { name: 'Typewriter', sample: 'Type…', style: { fontFamily: 'Consolas', fontSize: 15 }, preset: { name: 'Typewriter', text: { content: 'Once upon a time…', font: 'Consolas', size: 80, bold: false, anim: 'typewriter', animDur: 2 } } },
  { name: 'Outline', sample: 'BOLD', style: { fontWeight: 900, fontSize: 18, color: '#facc15', WebkitTextStroke: '1px #000' }, preset: { name: 'Outline title', text: { content: 'WOW!', font: 'Impact', size: 180, color: '#facc15', strokeWidth: 8, bold: false }, transIn: { type: 'zoom', dur: 0.4 } } },
];

const SHAPES = [
  { name: 'Box', icon: 'shapes', kind: 'shape', preset: { shape: { kind: 'rect' } } },
  { name: 'Circle', icon: 'shapes', kind: 'shape', preset: { shape: { kind: 'ellipse', w: 400, h: 400, fill: '#f43f5e' } } },
  { name: 'Color background', icon: 'image', kind: 'solid', preset: { color: '#1e3a8a' } },
];

function TextTab() {
  const st = useStore.getState();
  const drag = (kind, preset) => (e) => e.dataTransfer.setData('editsaq/graphic', JSON.stringify({ kind, preset }));
  return (
    <div className="tab-body">
      <p className="tab-hint">Click to add at the red line, or drag onto the timeline.</p>
      <h5>Text styles</h5>
      <div className="preset-grid">
        {TEXT_PRESETS.map((p) => (
          <button key={p.name} className="preset-card" draggable onDragStart={drag('text', p.preset)} onClick={() => st.addGraphic('text', p.preset)}>
            <span className="preset-sample" style={p.style}>{p.sample}</span>
            <span className="preset-name">{p.name}</span>
          </button>
        ))}
      </div>
      <h5>Shapes & backgrounds</h5>
      <div className="preset-grid">
        {SHAPES.map((p) => (
          <button key={p.name} className="preset-card" draggable onDragStart={drag(p.kind, p.preset)} onClick={() => st.addGraphic(p.kind, p.preset)}>
            <span className="preset-sample"><Icon name={p.icon} size={22} /></span>
            <span className="preset-name">{p.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// One-click looks. Each preset edits the selected visual clips.
const EFFECTS = [
  { name: 'Black & white', swatch: 'linear-gradient(135deg,#eee,#333)', apply: (c) => { c.fx.grayscale = 100; } },
  { name: 'Old photo', swatch: 'linear-gradient(135deg,#e8d3a9,#7a5c2e)', apply: (c) => { c.fx.sepia = 80; c.fx.vignette = 50; c.props.contrast.v = 110; } },
  { name: 'Warm', swatch: 'linear-gradient(135deg,#ffcf8a,#e0603a)', apply: (c) => { c.fx.sepia = 25; c.props.saturation.v = 120; c.props.brightness.v = 105; } },
  { name: 'Cool', swatch: 'linear-gradient(135deg,#9fd5ff,#2a5bd7)', apply: (c) => { c.props.hue.v = 15; c.props.saturation.v = 90; c.props.brightness.v = 102; } },
  { name: 'Vivid', swatch: 'linear-gradient(135deg,#ff3d81,#ffd400,#00d4a8)', apply: (c) => { c.props.saturation.v = 160; c.props.contrast.v = 115; } },
  { name: 'Cinematic', swatch: 'linear-gradient(135deg,#0d3b4c,#e08a3c)', apply: (c) => { c.props.contrast.v = 125; c.props.saturation.v = 85; c.fx.vignette = 45; } },
  { name: 'Dreamy', swatch: 'linear-gradient(135deg,#fde2ff,#c3b5ff)', apply: (c) => { c.props.brightness.v = 115; c.props.blur.v = 1.5; c.props.saturation.v = 110; } },
  { name: 'Faded', swatch: 'linear-gradient(135deg,#d9d4cc,#8f8a80)', apply: (c) => { c.props.contrast.v = 80; c.props.saturation.v = 70; c.props.brightness.v = 110; } },
  { name: 'Negative', swatch: 'linear-gradient(135deg,#00ffd5,#3300ff)', apply: (c) => { c.fx.invert = 100; } },
  { name: 'Dark edges', swatch: 'radial-gradient(#ddd,#111)', apply: (c) => { c.fx.vignette = 70; } },
  { name: 'Blur', swatch: 'radial-gradient(#9cc4ff,#334)', apply: (c) => { c.props.blur.v = 8; } },
  { name: 'Mirror', swatch: 'linear-gradient(90deg,#5b8def 50%,#8fb2f5 50%)', apply: (c) => { c.fx.flipH = !c.fx.flipH; } },
  { name: 'Slow zoom in', swatch: 'radial-gradient(#ffe08a,#c66)', motion: true, apply: (c) => { c.props.scale.kf = [{ t: 0, v: 100, ease: 'linear' }, { t: c.duration, v: 120, ease: 'linear' }]; } },
  { name: 'Slow zoom out', swatch: 'radial-gradient(#c66,#ffe08a)', motion: true, apply: (c) => { c.props.scale.kf = [{ t: 0, v: 120, ease: 'linear' }, { t: c.duration, v: 100, ease: 'linear' }]; } },
  { name: 'Pan left → right', swatch: 'linear-gradient(90deg,#334,#8ab)', motion: true, apply: (c) => { c.props.scale.v = 115; c.props.x.kf = [{ t: 0, v: -120, ease: 'linear' }, { t: c.duration, v: 120, ease: 'linear' }]; } },
  { name: 'Spin', swatch: 'conic-gradient(#f43f5e,#facc15,#22c55e,#3b82f6,#f43f5e)', motion: true, apply: (c) => { c.props.rotation.kf = [{ t: 0, v: 0, ease: 'linear' }, { t: c.duration, v: 360, ease: 'linear' }]; } },
  { name: 'Pop in', swatch: 'radial-gradient(#fff,#f472b6)', motion: true, apply: (c) => { c.props.scale.kf = [{ t: 0, v: 0, ease: 'out' }, { t: Math.min(0.35, c.duration / 2), v: 110, ease: 'ease' }, { t: Math.min(0.5, c.duration), v: 100, ease: 'linear' }]; } },
  { name: 'Shake', swatch: 'repeating-linear-gradient(45deg,#fb923c 0 6px,#7c2d12 6px 12px)', motion: true, apply: (c) => {
    const kf = [];
    for (let t = 0, i = 0; t <= Math.min(c.duration, 1.2); t += 0.06, i++) kf.push({ t, v: i % 2 ? 14 : -14, ease: 'linear' });
    kf.push({ t: Math.min(c.duration, 1.26), v: 0, ease: 'linear' });
    c.props.x.kf = kf;
  } },
];

function EffectsTab() {
  const selection = useStore((s) => s.selection);
  const project = useStore((s) => s.project);
  const st = useStore.getState();
  const targets = project.clips.filter((c) => withLinked(project, selection).has(c.id) && c.type !== 'audio');
  const apply = (fx) => {
    if (!targets.length) { st.showToast('First click a clip on the timeline, then pick an effect'); return; }
    st.updateClips(targets.map((c) => c.id), fx.apply);
    st.showToast(`${fx.name} added`);
  };
  return (
    <div className="tab-body">
      <p className={`tab-hint ${targets.length ? 'ok' : ''}`}>{targets.length ? `Click an effect to add it to the selected clip.` : 'Select a clip on the timeline first, then click an effect.'}</p>
      <h5>Looks</h5>
      <div className="fx-grid">
        {EFFECTS.filter((f) => !f.motion).map((f) => (
          <button key={f.name} className="fx-card" onClick={() => apply(f)}>
            <span className="fx-swatch" style={{ background: f.swatch }} />
            <span>{f.name}</span>
          </button>
        ))}
      </div>
      <h5>Motion</h5>
      <div className="fx-grid">
        {EFFECTS.filter((f) => f.motion).map((f) => (
          <button key={f.name} className="fx-card" onClick={() => apply(f)}>
            <span className="fx-swatch" style={{ background: f.swatch }} />
            <span>{f.name}</span>
          </button>
        ))}
      </div>
      <button className="text-btn wide" disabled={!targets.length} onClick={() => st.updateClips(targets.map((c) => c.id), (c) => {
        c.props = makeProps();
        c.fx = { ...c.fx, grayscale: 0, sepia: 0, invert: 0, vignette: 0, flipH: false, flipV: false };
      })}><Icon name="reset" size={14} /> Remove all effects from clip</button>
    </div>
  );
}

function TransitionsTab() {
  const selection = useStore((s) => s.selection);
  const project = useStore((s) => s.project);
  const st = useStore.getState();
  const targets = project.clips.filter((c) => withLinked(project, selection).has(c.id) && c.type !== 'audio');
  const apply = (type, where) => {
    if (!targets.length) { st.showToast('First click a clip on the timeline, then pick a transition'); return; }
    st.updateClips(targets.map((c) => c.id), (c) => {
      const tr = { type, dur: Math.min(0.8, c.duration / 3) };
      if (where !== 'end') c.transIn = tr;
      if (where !== 'start') c.transOut = { ...tr };
    });
    // Fade the linked sound too, so cuts feel smooth.
    if (type === 'fade') st.updateClips([...withLinked(project, targets.map((c) => c.id))], (c) => {
      if (c.type !== 'audio') return;
      if (where !== 'end') c.audioFadeIn = Math.min(0.8, c.duration / 3);
      if (where !== 'start') c.audioFadeOut = Math.min(0.8, c.duration / 3);
    });
  };
  return (
    <div className="tab-body">
      <p className={`tab-hint ${targets.length ? 'ok' : ''}`}>{targets.length ? 'Choose where the transition goes on the selected clip.' : 'Select a clip on the timeline first.'}</p>
      <div className="trans-list">
        {TRANSITIONS.map((t) => (
          <div key={t.id} className="trans-item">
            <span className="trans-icon">{t.icon}</span>
            <span className="trans-name">{t.label}</span>
            <div className="seg small">
              <button onClick={() => apply(t.id, 'start')} title="Add at the start of the clip">Start</button>
              <button onClick={() => apply(t.id, 'end')} title="Add at the end of the clip">End</button>
              <button onClick={() => apply(t.id, 'both')} title="Add at both ends">Both</button>
            </div>
          </div>
        ))}
      </div>
      <p className="tab-hint">Tip: to blend two clips, put one on <b>Video 2</b> overlapping the clip on <b>Video 1</b>, and give it a <b>Fade</b> at the start.</p>
      <button className="text-btn wide" disabled={!targets.length} onClick={() => st.updateClips(targets.map((c) => c.id), (c) => { c.transIn = null; c.transOut = null; })}>
        <Icon name="reset" size={14} /> Remove transitions from clip
      </button>
    </div>
  );
}

export default function LeftPanel() {
  const tab = useStore((s) => s.leftTab);
  return (
    <div className="left-panel">
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'on' : ''}`} onClick={() => useStore.setState({ leftTab: t.id })}>
            <Icon name={t.icon} size={18} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      {tab === 'media' && <MediaTab />}
      {tab === 'text' && <TextTab />}
      {tab === 'effects' && <EffectsTab />}
      {tab === 'transitions' && <TransitionsTab />}
    </div>
  );
}
