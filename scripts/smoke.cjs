// Automated smoke test: EDITSAQ_SMOKE=<media dir> electron .
// Imports test media, edits, screenshots each stage and exports an MP4, then quits.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

module.exports = function smoke(win, ffmpegPath) {
  const dir = process.env.EDITSAQ_SMOKE;
  const out = path.join(dir, 'shots');
  fs.mkdirSync(out, { recursive: true });
  const errors = [];
  win.webContents.on('console-message', (e, lvl, legacyMsg) => {
    const level = e.level ?? lvl;
    const msg = e.message ?? legacyMsg;
    if (level === 'error' || level === 3) errors.push(msg);
  });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => win.webContents.executeJavaScript(code, true);
  const shot = async (name) => fs.writeFileSync(path.join(out, name + '.png'), (await win.webContents.capturePage()).toPNG());
  const log = (...a) => console.log('[smoke]', ...a);

  win.webContents.once('did-finish-load', async () => {
    try {
      win.setSize(1600, 950);
      await wait(1500);
      await shot('1-welcome');
      await js(`document.querySelector('.size-card').click()`);
      await wait(500);
      await shot('2-empty-editor');
      const files = ['clip.mp4', 'picture.png', 'music.mp3', 'old.avi'].map((f) => path.join(dir, f));
      await js(`window.__editsaq.importPaths(${JSON.stringify(files)}, { place: true })`);
      // wait for thumbnails / proxy conversion
      for (let i = 0; i < 60; i++) {
        const ready = await js(`(() => { const c = window.__editsaq.useMediaCache.getState(); const m = window.__editsaq.useStore.getState().project.media; return m.length === 4 && m.every((x) => c[x.id]?.status === 'ready'); })()`);
        if (ready) break;
        await wait(500);
      }
      const status = await js(`JSON.stringify(Object.values(window.__editsaq.useMediaCache.getState()).map((c) => c.status + (c.playPath ? ' (proxy)' : '')))`);
      log('media status', status);
      const summary = await js(`JSON.stringify(window.__editsaq.useStore.getState().project.clips.map((c) => [c.type, c.trackId, +c.start.toFixed(2), +c.duration.toFixed(2)]))`);
      log('clips', summary);
      // Add a title, apply an effect, and look at second 2.
      await js(`(() => { const s = window.__editsaq.useStore.getState(); window.__editsaq.useTime.setState({ t: 0.5 }); s.addGraphic('text', { text: { content: 'EditSaq test', size: 120 }, transIn: { type: 'fade', dur: 0.5 } }); })()`);
      await js(`(() => { const s = window.__editsaq.useStore.getState(); const v = s.project.clips.find((c) => c.type === 'video'); s.select([v.id]); s.updateClip(v.id, (c) => { c.fx.vignette = 60; c.props.scale.kf = [{ t: 0, v: 100, ease: 'linear' }, { t: 6, v: 130, ease: 'linear' }]; }); window.__editsaq.useTime.setState({ t: 2 }); })()`);
      await wait(3500);
      const vstate = await js(`(() => { const s = window.__editsaq.useStore.getState(); const v = s.project.clips.find((c) => c.type === 'video'); const el = window.__editsaq.previewSources.video(v); return el ? JSON.stringify({ rs: el.readyState, ns: el.networkState, t: el.currentTime, w: el.videoWidth, err: el.error && el.error.message, seeking: el.seeking, src: el.src.slice(0, 60) }) : 'no element'; })()`);
      log('preview video', vstate);
      await shot('3-editing');
      await js(`window.__editsaq.useStore.setState({ mode: 'advanced', leftTab: 'effects' })`);
      await wait(400);
      await shot('4-advanced');
      // Split, undo, redo
      const splitCheck = await js(`(() => { const s = window.__editsaq.useStore.getState(); const n0 = s.project.clips.length; window.__editsaq.useTime.setState({ t: 3 }); s.splitAtPlayhead(); const n1 = window.__editsaq.useStore.getState().project.clips.length; s.undo(); const n2 = window.__editsaq.useStore.getState().project.clips.length; s.redo(); const n3 = window.__editsaq.useStore.getState().project.clips.length; return [n0, n1, n2, n3].join(','); })()`);
      log('split/undo/redo clip counts', splitCheck);
      // New transitions: iris in on the picture, flash out on the AVI clip.
      await js(`(() => { const s = window.__editsaq.useStore.getState(); const img = s.project.clips.find((c) => c.type === 'image'); const avi = s.project.clips.filter((c) => c.type === 'video').pop(); s.updateClip(img.id, (c) => { c.transIn = { type: 'iris', dur: 1 }; }); s.updateClip(avi.id, (c) => { c.transOut = { type: 'flash', dur: 1 }; }); window.__editsaq.useTime.setState({ t: img.start + 0.5 }); })()`);
      await wait(800);
      await shot('4b-iris');
      await js(`window.__editsaq.useStore.setState({ exportOpen: true })`);
      await wait(300);
      await shot('5-export-dialog');
      await js(`window.__editsaq.useStore.setState({ exportOpen: false })`);
      const mp4 = path.join(dir, 'export-test.mp4');
      const t0 = Date.now();
      const r = await js(`window.__editsaq.runExport({ out: ${JSON.stringify(mp4)}, format: 'h264', scale: 0.5, crf: 23 })`);
      log('export', JSON.stringify(r), `${((Date.now() - t0) / 1000).toFixed(1)}s`);
      if (r.ok) {
        let info = '';
        try { execFileSync(ffmpegPath, ['-hide_banner', '-i', mp4], { stdio: 'pipe' }); } catch (e) { info = String(e.stderr); }
        log('export probe', info.split('\n').filter((l) => /Duration|Stream/.test(l)).map((l) => l.trim()).join(' | '));
        execFileSync(ffmpegPath, ['-y', '-loglevel', 'error', '-ss', '2', '-i', mp4, '-frames:v', '1', path.join(out, '6-exported-frame.png')]);
      }
      const mp3 = path.join(dir, 'export-test.mp3');
      const r2 = await js(`window.__editsaq.runExport({ out: ${JSON.stringify(mp3)}, format: 'mp3', scale: 1, crf: 23 })`);
      log('mp3 export', JSON.stringify(r2), fs.existsSync(mp3) ? fs.statSync(mp3).size + ' bytes' : 'missing');
    } catch (e) {
      log('FAILED', e.stack || e);
    }
    log('console errors', errors.length ? errors.join('\n') : 'none');
    win.__dirty = false;
    app.exit(0);
  });
};
