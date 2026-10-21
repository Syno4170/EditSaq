// New / open / save, with an "unsaved changes" check.
import { useStore, useMediaCache } from './store';
import { prepareMedia } from './media';

function confirmDiscard() {
  return !useStore.getState().dirty || confirm('You have unsaved changes. Continue without saving?');
}

export async function saveProject(saveAs = false) {
  const st = useStore.getState();
  const filePath = await window.editsaq.saveProject({
    json: JSON.stringify(st.project, null, 1),
    filePath: saveAs ? null : st.filePath,
    name: st.project.name,
  });
  if (!filePath) return false;
  useStore.setState({ filePath, dirty: false });
  window.editsaq.setDirty(false);
  st.showToast('Project saved');
  return true;
}

export async function openProject() {
  if (!confirmDiscard()) return;
  const r = await window.editsaq.openProject();
  if (!r) return;
  let project;
  try {
    project = JSON.parse(r.json);
    if (!project.tracks || !project.clips) throw new Error('bad');
  } catch {
    useStore.getState().showToast('That file is not an EditSaq project', 'warn');
    return;
  }
  useMediaCache.setState({}, true);
  useStore.getState().loadProject(project, r.filePath);
  project.media.forEach(prepareMedia);
}

export function startNew(opts) {
  if (!confirmDiscard()) return false;
  useMediaCache.setState({}, true);
  useStore.getState().newProject(opts);
  return true;
}
