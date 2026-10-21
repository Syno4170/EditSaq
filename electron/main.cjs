// EditSaq main process: window, local media protocol, FFmpeg (probe, waveforms, proxies, export).
const { app, BrowserWindow, ipcMain, dialog, protocol, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

let ffmpegPath = require('ffmpeg-static');
if (app.isPackaged) ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');

const isDev = !!process.env.EDITSAQ_DEV;
let win = null;

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true },
  },
]);

const MIME = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.flac': 'audio/flac',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.svg': 'image/svg+xml',
};

// Node stream -> web stream that stops reading when the player aborts the request (happens on every seek).
function nodeToWeb(ns) {
  return new ReadableStream({
    start(controller) {
      ns.on('data', (chunk) => {
        try { controller.enqueue(new Uint8Array(chunk)); } catch { ns.destroy(); return; }
        if (controller.desiredSize <= 0) ns.pause();
      });
      ns.on('end', () => { try { controller.close(); } catch {} });
      ns.on('error', (e) => { try { controller.error(e); } catch {} });
    },
    pull() { ns.resume(); },
    cancel() { ns.destroy(); },
  });
}

const CHUNK = 4 * 1024 * 1024;

function registerMediaProtocol() {
  protocol.handle('media', async (req) => {
    const filePath = decodeURIComponent(new URL(req.url).pathname.slice(1));
    let stat;
    try { stat = await fs.promises.stat(filePath); } catch { return new Response('Not found', { status: 404 }); }
    const size = stat.size;
    const headers = {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
    };
    const range = req.headers.get('range');
    const m = range && /bytes=(\d*)-(\d*)/.exec(range);
    if (m && size > 0) {
      let start = m[1] ? parseInt(m[1], 10) : 0;
      // Open-ended requests ("bytes=N-") get a bounded chunk. Players otherwise hold the stream open
      // while paused, and a handful of idle players exhaust the per-host connection limit, so seeks hang.
      let end = m[2] ? parseInt(m[2], 10) : Math.min(size - 1, start + CHUNK - 1);
      if (!m[1] && m[2]) { start = Math.max(0, size - parseInt(m[2], 10)); end = size - 1; }
      end = Math.min(end, size - 1);
      if (start > end) return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
      return new Response(nodeToWeb(fs.createReadStream(filePath, { start, end })), {
        status: 206,
        headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) },
      });
    }
    return new Response(nodeToWeb(fs.createReadStream(filePath)), { status: 200, headers: { ...headers, 'Content-Length': String(size) } });
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 1100,
    minHeight: 680,
    backgroundColor: '#14161b',
    title: 'EditSaq',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
  });
  // Ask before closing when there are unsaved changes (renderer sets this flag).
  win.on('close', (e) => {
    if (!win.__dirty) return;
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Close without saving', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'Unsaved changes',
      message: 'Your project has unsaved changes. Close EditSaq anyway?',
    });
    if (choice === 1) e.preventDefault();
  });
  if (isDev) win.loadURL('http://127.0.0.1:5199');
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  if (process.env.EDITSAQ_SMOKE) require('../scripts/smoke.cjs')(win, ffmpegPath);
}

// ---------- FFmpeg helpers ----------

function runFfmpeg(args, { collectStdout = false, onStderr } = {}) {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, args, { windowsHide: true });
    const out = [];
    let err = '';
    proc.stdout.on('data', (d) => { if (collectStdout) out.push(d); });
    proc.stderr.on('data', (d) => { const s = d.toString(); err += s; if (err.length > 200000) err = err.slice(-100000); onStderr && onStderr(s); });
    proc.on('error', (e) => resolve({ code: -1, stderr: String(e), stdout: Buffer.alloc(0) }));
    proc.on('close', (code) => resolve({ code, stderr: err, stdout: Buffer.concat(out) }));
  });
}

function parseProbe(text) {
  const info = { duration: 0, width: 0, height: 0, fps: 0, hasVideo: false, hasAudio: false };
  const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text);
  if (d) info.duration = +d[1] * 3600 + +d[2] * 60 + parseFloat(d[3]);
  for (const line of text.split('\n')) {
    if (/Stream #.*Video:/.test(line) && !/attached pic/.test(line)) {
      if (!info.hasVideo) {
        info.hasVideo = true;
        const s = /,\s*(\d{2,5})x(\d{2,5})/.exec(line);
        if (s) { info.width = +s[1]; info.height = +s[2]; }
        const f = /([\d.]+)\s*fps/.exec(line);
        if (f) info.fps = parseFloat(f[1]);
      }
    } else if (/Stream #.*Audio:/.test(line)) {
      info.hasAudio = true;
    }
  }
  return info;
}

ipcMain.handle('media:probe', async (_e, file) => {
  const r = await runFfmpeg(['-hide_banner', '-i', file]);
  return parseProbe(r.stderr);
});

// Waveform peaks: 100 values per second, 0..255.
ipcMain.handle('media:peaks', async (_e, file) => {
  const r = await runFfmpeg(['-hide_banner', '-loglevel', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '4000', '-f', 's16le', 'pipe:1'], { collectStdout: true });
  const buf = r.stdout;
  const samples = Math.floor(buf.length / 2);
  const per = 40;
  const peaks = new Array(Math.ceil(samples / per));
  for (let i = 0; i < peaks.length; i++) {
    let max = 0;
    const end = Math.min(samples, (i + 1) * per);
    for (let j = i * per; j < end; j++) {
      const v = Math.abs(buf.readInt16LE(j * 2));
      if (v > max) max = v;
    }
    peaks[i] = Math.min(255, Math.round((max / 32768) * 255));
  }
  return peaks;
});

// Files the built-in player can't decode (HEVC, AVI, ProRes, ...) get an H.264 editing copy.
ipcMain.handle('media:proxy', async (_e, file) => {
  const dir = path.join(app.getPath('userData'), 'proxies');
  await fs.promises.mkdir(dir, { recursive: true });
  const stat = await fs.promises.stat(file);
  const hash = crypto.createHash('md5').update(file + stat.size + stat.mtimeMs).digest('hex').slice(0, 16);
  const out = path.join(dir, hash + '.mp4');
  if (fs.existsSync(out)) return out;
  const tmp = out + '.part.mp4';
  const r = await runFfmpeg(['-y', '-hide_banner', '-i', file, '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-g', '15', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', tmp]);
  if (r.code !== 0) return null;
  await fs.promises.rename(tmp, out);
  return out;
});

ipcMain.handle('fs:exists', (_e, file) => fs.existsSync(file));

// ---------- Dialogs & project files ----------

const MEDIA_EXT = ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'wmv', 'flv', 'mts', 'm2ts', '3gp', 'mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg', 'opus', 'wma', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'];

ipcMain.handle('dialog:import', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Add videos, music or pictures',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Videos, music and pictures', extensions: MEDIA_EXT }, { name: 'All files', extensions: ['*'] }],
  });
  return r.canceled ? [] : r.filePaths;
});

ipcMain.handle('project:save', async (_e, { json, filePath, name }) => {
  let target = filePath;
  if (!target) {
    const r = await dialog.showSaveDialog(win, {
      title: 'Save project',
      defaultPath: (name || 'My video') + '.editsaq',
      filters: [{ name: 'EditSaq project', extensions: ['editsaq'] }],
    });
    if (r.canceled) return null;
    target = r.filePath;
  }
  await fs.promises.writeFile(target, json, 'utf8');
  return target;
});

ipcMain.handle('project:open', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Open project',
    properties: ['openFile'],
    filters: [{ name: 'EditSaq project', extensions: ['editsaq'] }],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const json = await fs.promises.readFile(r.filePaths[0], 'utf8');
  return { filePath: r.filePaths[0], json };
});

ipcMain.handle('dialog:saveFile', async (_e, { title, defaultName, filters }) => {
  const r = await dialog.showSaveDialog(win, { title, defaultPath: path.join(app.getPath('videos'), defaultName), filters });
  return r.canceled ? null : r.filePath;
});

ipcMain.handle('fs:writeDataUrl', async (_e, { filePath, dataUrl }) => {
  const b64 = dataUrl.split(',')[1];
  await fs.promises.writeFile(filePath, Buffer.from(b64, 'base64'));
  return true;
});

ipcMain.handle('shell:showItem', (_e, file) => shell.showItemInFolder(file));
ipcMain.on('app:dirty', (_e, dirty) => { if (win) win.__dirty = !!dirty; });
ipcMain.on('app:title', (_e, title) => { if (win) win.setTitle(title); });

// ---------- Export ----------

const fmt = (n) => Number(n).toFixed(4);

function atempoChain(speed) {
  const parts = [];
  let s = speed;
  while (s > 2) { parts.push('atempo=2'); s /= 2; }
  while (s < 0.5) { parts.push('atempo=0.5'); s /= 0.5; }
  if (Math.abs(s - 1) > 1e-4) parts.push(`atempo=${fmt(s)}`);
  return parts.length ? ',' + parts.join(',') : '';
}

// Mix every audio clip into one track with FFmpeg. Returns false when there is no audio at all.
async function mixAudio(clips, total, outFile, codecArgs) {
  if (!clips.length) return false;
  const args = ['-y', '-hide_banner'];
  clips.forEach((c) => args.push('-i', c.path));
  const parts = clips.map((c, i) => {
    let f = `[${i}:a]atrim=start=${fmt(c.in)}:duration=${fmt(c.duration * c.speed)},asetpts=PTS-STARTPTS`;
    f += atempoChain(c.speed);
    f += `,volume=${fmt(c.volume)}`;
    if (c.fadeIn > 0) f += `,afade=t=in:st=0:d=${fmt(c.fadeIn)}`;
    if (c.fadeOut > 0) f += `,afade=t=out:st=${fmt(Math.max(0, c.duration - c.fadeOut))}:d=${fmt(c.fadeOut)}`;
    const ms = Math.round(c.start * 1000);
    f += `,aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[a${i}]`;
    return f;
  });
  const labels = clips.map((_c, i) => `[a${i}]`).join('');
  const filter = `${parts.join(';')};${labels}amix=inputs=${clips.length}:normalize=0:dropout_transition=0,apad,atrim=duration=${fmt(total)}[out]`;
  args.push('-filter_complex', filter, '-map', '[out]', '-ar', '48000', '-ac', '2', ...codecArgs, outFile);
  const r = await runFfmpeg(args);
  if (r.code !== 0) throw new Error('Audio mix failed:\n' + r.stderr.slice(-1500));
  return true;
}

let job = null;

// Streams decoded RGBA frames of one clip from FFmpeg, one timeline frame at a time.
class FrameReader {
  constructor(args, frameSize) {
    this.frameSize = frameSize;
    this.chunks = [];
    this.len = 0;
    this.waiters = [];
    this.ended = false;
    this.proc = spawn(ffmpegPath, args, { windowsHide: true });
    this.proc.stderr.on('data', () => {});
    this.proc.stdout.on('data', (d) => {
      this.chunks.push(d);
      this.len += d.length;
      if (this.len > frameSize * 4) this.proc.stdout.pause();
      this.flush();
    });
    this.proc.stdout.on('end', () => { this.ended = true; this.flush(); });
    this.proc.on('error', () => { this.ended = true; this.flush(); });
  }
  flush() {
    while (this.waiters.length && (this.len >= this.frameSize || this.ended)) {
      const resolve = this.waiters.shift();
      if (this.len < this.frameSize) { resolve(null); continue; }
      const buf = this.chunks.length === 1 ? this.chunks[0] : Buffer.concat(this.chunks);
      const rest = buf.subarray(this.frameSize);
      this.chunks = rest.length ? [rest] : [];
      this.len = rest.length;
      resolve(Buffer.from(buf.subarray(0, this.frameSize)));
    }
    if (this.len < this.frameSize * 4 && !this.ended) this.proc.stdout.resume();
  }
  next() { return new Promise((r) => { this.waiters.push(r); this.flush(); }); }
  close() { try { this.proc.kill(); } catch {} }
}
const readers = new Map();
const closeReaders = () => { for (const r of readers.values()) r.close(); readers.clear(); };

ipcMain.handle('export:openClip', (_e, { id, path: file, from, speed, fps, width, height }) => {
  const args = ['-hide_banner', '-loglevel', 'error', '-ss', fmt(from), '-i', file, '-an',
    '-vf', `setpts=(PTS-STARTPTS)/${fmt(speed)},fps=${fps},scale=${width}:${height}:flags=bicubic,format=yuv420p`,
    '-f', 'rawvideo', '-pix_fmt', 'yuv420p', 'pipe:1'];
  readers.get(id)?.close();
  // I420: full-size luma plane + two quarter-size chroma planes (the renderer turns it into a VideoFrame).
  readers.set(id, new FrameReader(args, (width * height * 3) / 2));
  return true;
});
ipcMain.handle('export:clipFrame', (_e, id) => readers.get(id)?.next() ?? null);
ipcMain.handle('export:closeClip', (_e, id) => { readers.get(id)?.close(); readers.delete(id); });

ipcMain.handle('export:audioOnly', async (_e, { clips, total, out }) => {
  try {
    const ok = await mixAudio(clips, total, out, ['-c:a', 'libmp3lame', '-b:a', '256k']);
    return ok ? { ok: true } : { ok: false, error: 'There is no sound in this project to export.' };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
});

ipcMain.handle('export:start', async (_e, opts) => {
  const { out, width, height, fps, format, crf, audioClips, total, encoded } = opts;
  let audioFile = null;
  try {
    const tmp = path.join(os.tmpdir(), `editsaq-audio-${Date.now()}.wav`);
    if (await mixAudio(audioClips, total, tmp, ['-c:a', 'pcm_s16le'])) audioFile = tmp;
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
  // `encoded`: the renderer already produced H.264 on the GPU (WebCodecs); FFmpeg only muxes it.
  const args = encoded
    ? ['-y', '-hide_banner', '-fflags', '+genpts', '-f', 'h264', '-r', String(fps), '-i', 'pipe:0']
    : ['-y', '-hide_banner', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`, '-r', String(fps), '-i', 'pipe:0'];
  if (audioFile) args.push('-i', audioFile);
  args.push('-map', '0:v');
  if (audioFile) args.push('-map', '1:a');
  if (encoded) {
    args.push('-c:v', 'copy');
    if (audioFile) args.push('-c:a', 'aac', '-b:a', '256k');
    args.push('-movflags', '+faststart', out);
  } else if (format === 'webm') {
    args.push('-c:v', 'libvpx-vp9', '-crf', String(crf + 10), '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4');
    if (audioFile) args.push('-c:a', 'libopus', '-b:a', '192k');
  } else {
    if (format === 'h265') args.push('-c:v', 'libx265', '-crf', String(crf + 4), '-preset', 'medium', '-tag:v', 'hvc1');
    else args.push('-c:v', 'libx264', '-crf', String(crf), '-preset', 'medium');
    if (audioFile) args.push('-c:a', 'aac', '-b:a', '256k');
    args.push('-movflags', '+faststart');
  }
  if (!encoded) args.push('-pix_fmt', 'yuv420p', out);

  const proc = spawn(ffmpegPath, args, { windowsHide: true });
  let stderr = '';
  proc.stderr.on('data', (d) => { stderr += d.toString(); if (stderr.length > 100000) stderr = stderr.slice(-50000); });
  proc.stdin.on('error', () => {});
  const done = new Promise((resolve) => proc.on('close', (code) => resolve(code)));
  job = { proc, done, audioFile, out, get stderr() { return stderr; } };
  return { ok: true };
});

ipcMain.handle('export:frame', async (_e, bytes) => {
  if (!job) return false;
  const ok = job.proc.stdin.write(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  if (!ok) await new Promise((r) => job.proc.stdin.once('drain', r));
  return true;
});

ipcMain.handle('export:finish', async () => {
  if (!job) return { ok: false, error: 'No export running' };
  const j = job;
  job = null;
  closeReaders();
  j.proc.stdin.end();
  const code = await j.done;
  if (j.audioFile) fs.promises.unlink(j.audioFile).catch(() => {});
  return code === 0 ? { ok: true, out: j.out } : { ok: false, error: j.stderr.slice(-1500) };
});

ipcMain.handle('export:cancel', async () => {
  closeReaders();
  if (!job) return true;
  const j = job;
  job = null;
  j.proc.kill();
  await j.done;
  if (j.audioFile) fs.promises.unlink(j.audioFile).catch(() => {});
  fs.promises.unlink(j.out).catch(() => {});
  return true;
});

app.whenReady().then(() => {
  registerMediaProtocol();
  createWindow();
});
app.on('window-all-closed', () => app.quit());
