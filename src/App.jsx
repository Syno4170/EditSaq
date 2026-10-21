import { useEffect, useState } from 'react';
import { useStore, useTime } from './store';
import { startEngine, togglePlay, stepFrames, seek, pause } from './playback';
import { projectDuration } from './model';
import { saveProject, openProject } from './project-files';
import { importDialog, importPaths } from './media';
import TopBar from './components/TopBar';
import LeftPanel from './components/LeftPanel';
import Viewer from './components/Viewer';
import Inspector from './components/Inspector';
import Timeline from './components/Timeline';
import { Welcome, SettingsDialog, ExportDialog, HelpDialog, Toast } from './components/Dialogs';

function useShortcuts() {
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName;
      const typing = (tag === 'INPUT' && !['range', 'checkbox', 'color'].includes(e.target.type)) || tag === 'TEXTAREA' || tag === 'SELECT';
      const st = useStore.getState();
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (ctrl && k === 's') { e.preventDefault(); saveProject(e.shiftKey); return; }
      if (ctrl && k === 'o') { e.preventDefault(); openProject(); return; }
      if (ctrl && k === 'i') { e.preventDefault(); importDialog(); return; }
      if (ctrl && k === 'e') { e.preventDefault(); useStore.setState({ exportOpen: true }); return; }
      if (e.key === 'F1') { e.preventDefault(); useStore.setState({ helpOpen: true }); return; }
      if (typing || st.welcome || st.exportOpen) return;
      if (ctrl && k === 'z' && !e.shiftKey) { e.preventDefault(); st.undo(); return; }
      if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); st.redo(); return; }
      if (ctrl && k === 'c') { st.copySelection(); return; }
      if (ctrl && k === 'v') { st.pasteClipboard(); return; }
      if (ctrl && k === 'd') { e.preventDefault(); st.duplicateSelection(); return; }
      if (ctrl && k === 'a') { e.preventDefault(); st.select(st.project.clips.map((c) => c.id)); return; }
      if (ctrl) return;
      const t = useTime.getState().t;
      switch (e.key) {
        case ' ': e.preventDefault(); togglePlay(); break;
        case 'ArrowLeft': e.preventDefault(); e.shiftKey ? (pause(), seek(t - 1)) : stepFrames(-1); break;
        case 'ArrowRight': e.preventDefault(); e.shiftKey ? (pause(), seek(t + 1)) : stepFrames(1); break;
        case 'Home': seek(0); break;
        case 'End': seek(projectDuration(st.project)); break;
        case 'Delete': case 'Backspace': st.deleteSelection(e.shiftKey); break;
        case 'Escape': st.select([]); useStore.setState({ tool: 'select' }); break;
        case '+': case '=': useStore.setState({ zoom: Math.min(1200, st.zoom * 1.4) }); break;
        case '-': case '_': useStore.setState({ zoom: Math.max(4, st.zoom / 1.4) }); break;
        case '\\': window.dispatchEvent(new Event('editsaq:fit')); break;
        default:
          if (k === 's') st.splitAtPlayhead();
          else if (k === 'v') useStore.setState({ tool: 'select' });
          else if (k === 'c') useStore.setState({ tool: 'razor' });
          else if (k === 'm') st.addMarker();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export default function App() {
  const welcome = useStore((s) => s.welcome);
  const exportOpen = useStore((s) => s.exportOpen);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const helpOpen = useStore((s) => s.helpOpen);
  const [tlHeight, setTlHeight] = useState(() => Math.round(window.innerHeight * 0.36));
  const [fileOver, setFileOver] = useState(false);
  useShortcuts();
  useEffect(() => { startEngine(); }, []);

  // Files dropped anywhere outside the timeline/media bin get imported.
  const onDrop = async (e) => {
    setFileOver(false);
    if (e.defaultPrevented) return;
    e.preventDefault();
    const files = [...e.dataTransfer.files].map((f) => window.editsaq.pathForFile(f)).filter(Boolean);
    if (files.length) await importPaths(files, { place: !useStore.getState().project.clips.length });
  };

  const startResize = (e) => {
    const y0 = e.clientY, h0 = tlHeight;
    const move = (ev) => setTlHeight(Math.max(170, Math.min(window.innerHeight - 300, h0 - (ev.clientY - y0))));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div
      className="app"
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setFileOver(true); } }}
      onDragLeave={(e) => { if (!e.relatedTarget) setFileOver(false); }}
      onDrop={onDrop}
    >
      <TopBar />
      <div className="workspace" style={{ gridTemplateRows: `1fr 6px ${tlHeight}px` }}>
        <div className="upper">
          <LeftPanel />
          <Viewer />
          <Inspector />
        </div>
        <div className="resizer" onPointerDown={startResize} title="Drag to resize the timeline" />
        <Timeline />
      </div>
      {fileOver && <div className="file-over">Drop to add your files</div>}
      {welcome && <Welcome />}
      {settingsOpen && <SettingsDialog />}
      {exportOpen && <ExportDialog />}
      {helpOpen && <HelpDialog />}
      <Toast />
    </div>
  );
}
