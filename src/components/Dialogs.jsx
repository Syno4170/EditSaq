import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { PRESET_SIZES, projectDuration, formatTime } from '../model';
import { runExport, cancelExport } from '../export';
import { startNew, openProject } from '../project-files';
import { Icon, Modal } from './ui';
import { Logo } from './TopBar';

function SizeIcon({ w, h }) {
  const s = 34 / Math.max(w, h);
  return <span className="size-icon"><span style={{ width: w * s, height: h * s }} /></span>;
}

export function Welcome() {
  const hasWork = useStore((s) => s.project.clips.length > 0 || s.dirty);
  const close = () => useStore.setState({ welcome: false });
  const create = (p) => { if (startNew({ width: p.width, height: p.height, name: 'My video' })) close(); };
  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="welcome-head">
          <Logo size={52} />
          <div>
            <h1>Welcome to EditSaq</h1>
            <p>Free video editing that's easy to learn. Pick where your video will be shown to begin.</p>
          </div>
        </div>
        <div className="size-grid">
          {PRESET_SIZES.map((p) => (
            <button key={p.id} className="size-card" onClick={() => create(p)}>
              <SizeIcon w={p.width} h={p.height} />
              <b>{p.label}</b>
              <span>{p.sub}</span>
            </button>
          ))}
        </div>
        <div className="welcome-steps">
          <div><span>1</span><b>Add your files</b><em>Videos, music and pictures</em></div>
          <div><span>2</span><b>Edit on the timeline</b><em>Cut, move, add text & effects</em></div>
          <div><span>3</span><b>Export</b><em>Get an MP4 to share anywhere</em></div>
        </div>
        <div className="welcome-foot">
          <button className="text-btn" onClick={async () => { await openProject(); }}><Icon name="folder" size={15} /> Open a saved project</button>
          {hasWork && <button className="text-btn" onClick={close}>Back to my current project</button>}
        </div>
      </div>
    </div>
  );
}

export function SettingsDialog() {
  const project = useStore((s) => s.project);
  const st = useStore.getState();
  const close = () => useStore.setState({ settingsOpen: false });
  const set = (fn) => st.updateProject(fn);
  return (
    <Modal title="Video settings" onClose={close}>
      <label className="field-label">Video shape & size</label>
      <div className="size-grid compact">
        {PRESET_SIZES.map((p) => (
          <button key={p.id} className={`size-card ${project.width === p.width && project.height === p.height ? 'on' : ''}`} onClick={() => set((pr) => { pr.width = p.width; pr.height = p.height; })}>
            <SizeIcon w={p.width} h={p.height} />
            <b>{p.label}</b>
            <span>{p.sub}</span>
          </button>
        ))}
      </div>
      <div className="field-row">
        <label className="field-label">Custom size</label>
        <input type="number" min={16} max={7680} value={project.width} onChange={(e) => set((p) => { p.width = Math.max(16, Math.round(+e.target.value / 2) * 2); })} />
        <span>×</span>
        <input type="number" min={16} max={4320} value={project.height} onChange={(e) => set((p) => { p.height = Math.max(16, Math.round(+e.target.value / 2) * 2); })} />
      </div>
      <div className="field-row">
        <label className="field-label">Frames per second</label>
        <select value={project.fps} onChange={(e) => set((p) => { p.fps = +e.target.value; })}>
          {[24, 25, 30, 50, 60].map((f) => <option key={f} value={f}>{f} fps{f === 30 ? ' (recommended)' : f === 24 ? ' (film look)' : f === 60 ? ' (smooth, gaming)' : ''}</option>)}
        </select>
      </div>
      <div className="field-row">
        <label className="field-label">Background color</label>
        <input type="color" value={project.background} onChange={(e) => set((p) => { p.background = e.target.value; })} />
      </div>
      <div className="modal-actions"><button className="primary-btn" onClick={close}>Done</button></div>
    </Modal>
  );
}

const FORMATS = [
  { id: 'h264', label: 'MP4 video', sub: 'Works everywhere: YouTube, phones, social media', ext: 'mp4' },
  { id: 'h265', label: 'MP4 (HEVC)', sub: 'Smaller file, newer devices only', ext: 'mp4' },
  { id: 'webm', label: 'WebM video', sub: 'For websites', ext: 'webm' },
  { id: 'mp3', label: 'MP3 sound only', sub: 'Just the audio', ext: 'mp3' },
];
const QUALITY = [{ crf: 17, label: 'Best' }, { crf: 21, label: 'Good' }, { crf: 26, label: 'Small file' }];

export function ExportDialog() {
  const project = useStore((s) => s.project);
  const [format, setFormat] = useState('h264');
  const [scale, setScale] = useState(1);
  const [crf, setCrf] = useState(21);
  const [state, setState] = useState({ phase: 'setup' });
  const close = () => { if (state.phase === 'running') return; useStore.setState({ exportOpen: false }); };
  const duration = projectDuration(project);
  const fmt = FORMATS.find((f) => f.id === format);

  useEffect(() => () => { if (state.phase === 'running') cancelExport(); }, []); // eslint-disable-line

  const start = async () => {
    const out = await window.editsaq.saveFileDialog({
      title: 'Save video as', defaultName: `${project.name}.${fmt.ext}`, filters: [{ name: fmt.label, extensions: [fmt.ext] }],
    });
    if (!out) return;
    setState({ phase: 'running', progress: 0, msg: 'Starting…' });
    const r = await runExport({ out, format, scale, crf, onProgress: (progress, msg) => setState({ phase: 'running', progress, msg }) });
    if (r.cancelled) setState({ phase: 'setup' });
    else if (r.ok) setState({ phase: 'done', out });
    else setState({ phase: 'error', error: r.error });
  };

  return (
    <Modal title="Export your video" onClose={state.phase === 'running' ? null : close} width={560}>
      {state.phase === 'setup' && <>
        {duration <= 0 ? <p className="warn-box">Your timeline is empty. Add some clips first.</p> : <p className="muted">Length: <b>{formatTime(duration, project.fps, false)}</b></p>}
        <label className="field-label">Format</label>
        <div className="choice-list">
          {FORMATS.map((f) => (
            <button key={f.id} className={`choice ${format === f.id ? 'on' : ''}`} onClick={() => setFormat(f.id)}>
              <span className="radio" /><b>{f.label}</b><em>{f.sub}</em>
            </button>
          ))}
        </div>
        {format !== 'mp3' && <>
          <label className="field-label">Size</label>
          <div className="seg wide">
            {[[1, `Full (${project.width}×${project.height})`], [0.5, `Half (${Math.round(project.width / 2)}×${Math.round(project.height / 2)})`]].map(([s, l]) => (
              <button key={s} className={scale === s ? 'on' : ''} onClick={() => setScale(s)}>{l}</button>
            ))}
          </div>
          <label className="field-label">Quality</label>
          <div className="seg wide">
            {QUALITY.map((q) => <button key={q.crf} className={crf === q.crf ? 'on' : ''} onClick={() => setCrf(q.crf)}>{q.label}</button>)}
          </div>
        </>}
        <div className="modal-actions">
          <button className="text-btn" onClick={close}>Cancel</button>
          <button className="primary-btn" disabled={duration <= 0} onClick={start}><Icon name="export" size={16} /> Export</button>
        </div>
      </>}
      {state.phase === 'running' && (
        <div className="export-progress">
          <div className="progress"><span style={{ width: `${Math.round(state.progress * 100)}%` }} /></div>
          <div className="progress-info"><b>{Math.round(state.progress * 100)}%</b><span>{state.msg}</span></div>
          <p className="muted">You can keep this window open. Exporting takes a little while for long videos.</p>
          <div className="modal-actions"><button className="text-btn" onClick={cancelExport}>Stop export</button></div>
        </div>
      )}
      {state.phase === 'done' && (
        <div className="export-done">
          <div className="done-icon"><Icon name="check" size={30} /></div>
          <h3>Your video is ready!</h3>
          <p className="muted path">{state.out}</p>
          <div className="modal-actions">
            <button className="text-btn" onClick={() => window.editsaq.showItem(state.out)}><Icon name="folder" size={15} /> Show in folder</button>
            <button className="primary-btn" onClick={() => useStore.setState({ exportOpen: false })}>Done</button>
          </div>
        </div>
      )}
      {state.phase === 'error' && (
        <div>
          <p className="warn-box">Something went wrong while exporting.</p>
          <pre className="error-log">{state.error}</pre>
          <div className="modal-actions"><button className="primary-btn" onClick={() => setState({ phase: 'setup' })}>Try again</button></div>
        </div>
      )}
    </Modal>
  );
}

const SHORTCUTS = [
  ['Space', 'Play / pause'], ['S', 'Split clip at the red line'], ['Delete', 'Delete selected clip'], ['Shift + Delete', 'Delete and close the gap'],
  ['Ctrl + Z / Ctrl + Y', 'Undo / redo'], ['Ctrl + C / Ctrl + V', 'Copy / paste clips'], ['Ctrl + D', 'Duplicate clip'],
  ['← / →', 'Move one frame'], ['Shift + ← / →', 'Move one second'], ['Home / End', 'Go to start / end'],
  ['V', 'Select tool'], ['C', 'Cut tool'], ['M', 'Add marker'], ['+ / -', 'Zoom timeline'], ['\\', 'Fit whole video in timeline'],
  ['Ctrl + S', 'Save project'], ['Ctrl + O', 'Open project'], ['Ctrl + I', 'Add files'], ['Ctrl + E', 'Export video'],
  ['Ctrl + mouse wheel', 'Zoom timeline'],
];

export function HelpDialog() {
  const close = () => useStore.setState({ helpOpen: false });
  return (
    <Modal title="How to use EditSaq" onClose={close} width={720}>
      <div className="help-grid">
        <div>
          <h4>The basics</h4>
          <ol className="help-steps">
            <li><b>Add files:</b> click <em>Add videos, music & pictures</em> on the left, or drag files into the window.</li>
            <li><b>Put them on the timeline:</b> drag them down to the timeline at the bottom.</li>
            <li><b>Trim:</b> drag the left or right edge of a clip to make it shorter.</li>
            <li><b>Cut:</b> move the red line to where you want to cut, then press <kbd>S</kbd>. Delete the piece you don't want.</li>
            <li><b>Add text:</b> open the <em>Text</em> tab and click a style. Type your words on the right.</li>
            <li><b>Make it look good:</b> select a clip and click a look in <em>Effects</em>, or a <em>Transition</em>.</li>
            <li><b>Music:</b> add a song. It goes on the <em>Music</em> track. Change volume and fades on the right.</li>
            <li><b>Export:</b> click the big <em>Export video</em> button at the top right.</li>
          </ol>
          <h4>Animation (Advanced mode)</h4>
          <p>Switch to <b>Advanced</b> at the top. Click the stopwatch next to a setting such as <em>Size</em>, move the red line, then change the value. EditSaq animates between the points (keyframes) for you.</p>
        </div>
        <div>
          <h4>Keyboard shortcuts</h4>
          <table className="shortcut-table">
            <tbody>{SHORTCUTS.map(([k, d]) => <tr key={k}><td><kbd>{k}</kbd></td><td>{d}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

export function Toast() {
  const toast = useStore((s) => s.toast);
  if (!toast) return null;
  return <div className={`toast ${toast.kind}`}>{toast.msg}</div>;
}
