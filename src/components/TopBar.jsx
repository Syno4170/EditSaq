import { useStore } from '../store';
import { saveProject, openProject } from '../project-files';
import { importDialog } from '../media';
import { Icon, IconButton } from './ui';

export function Logo({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c5cff" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="url(#lg)" />
      <path d="M12 9.5v13l11-6.5z" fill="#fff" />
    </svg>
  );
}

export default function TopBar() {
  const name = useStore((s) => s.project.name);
  const dirty = useStore((s) => s.dirty);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const mode = useStore((s) => s.mode);
  const st = useStore.getState();

  return (
    <header className="topbar">
      <div className="brand" title="EditSaq">
        <Logo />
        <span>EditSaq</span>
      </div>
      <div className="file-btns">
        <button className="text-btn" onClick={() => useStore.setState({ welcome: true })} title="Start a new video"><Icon name="plus" size={15} /> New</button>
        <button className="text-btn" onClick={openProject} title="Open a saved project (Ctrl+O)"><Icon name="folder" size={15} /> Open</button>
        <button className="text-btn" onClick={() => saveProject()} title="Save your project to keep working on it later (Ctrl+S)"><Icon name="save" size={15} /> Save</button>
        <button className="text-btn" onClick={importDialog} title="Add videos, music or pictures (Ctrl+I)"><Icon name="film" size={15} /> Add files</button>
      </div>
      <div className="history-btns">
        <IconButton icon="undo" label="Undo" shortcut="Ctrl+Z" disabled={!canUndo} onClick={st.undo} />
        <IconButton icon="redo" label="Redo" shortcut="Ctrl+Y" disabled={!canRedo} onClick={st.redo} />
      </div>
      <div className="project-name">
        <input value={name} onChange={(e) => st.updateProject((p) => { p.name = e.target.value; })} title="Project name" spellCheck={false} />
        {dirty && <span className="unsaved" title="Not saved yet">●</span>}
      </div>
      <div className="top-right">
        <div className="mode-switch" title="Simple shows the basics. Advanced adds keyframe animation, blend modes and more track tools.">
          <button className={mode === 'simple' ? 'on' : ''} onClick={() => useStore.setState({ mode: 'simple' })}>Simple</button>
          <button className={mode === 'advanced' ? 'on' : ''} onClick={() => useStore.setState({ mode: 'advanced' })}>Advanced</button>
        </div>
        <IconButton icon="settings" label="Video settings (size, frame rate, background)" onClick={() => useStore.setState({ settingsOpen: true })} />
        <IconButton icon="help" label="Help & keyboard shortcuts" shortcut="F1" onClick={() => useStore.setState({ helpOpen: true })} />
        <button className="export-btn" onClick={() => useStore.setState({ exportOpen: true })} title="Save your finished video (Ctrl+E)">
          <Icon name="export" size={17} /> Export video
        </button>
      </div>
    </header>
  );
}
