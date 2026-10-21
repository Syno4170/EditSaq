import { createRoot } from 'react-dom/client';
import App from './App';
import { useStore, useTime, useMediaCache } from './store';
import { importPaths } from './media';
import { runExport } from './export';
import { previewSources } from './playback';
import './styles.css';

// Handle for the automated smoke test (scripts/smoke.cjs).
window.__editsaq = { useStore, useTime, useMediaCache, importPaths, runExport, previewSources };

createRoot(document.getElementById('root')).render(<App />);
