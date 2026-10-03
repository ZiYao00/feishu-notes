const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright-core');
const { detectChrome } = require('../src/browser/browser-manager');
const { loadConfig } = require('../src/config/load-config');
const { startViewer } = require('../src/viewer/server');

function parseArgs(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (!raw.startsWith('-')) continue;
    const key = raw.replace(/^-+/, '').toLowerCase();
    const next = argv[i + 1];
    if (next == null || next.startsWith('-')) {
      values[key] = true;
    } else {
      values[key] = next;
      i += 1;
    }
  }
  return values;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function inside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function parseTimestamps(value) {
  const items = String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => Number(item));

  if (!items.length) throw new Error('At least one timestamp is required, for example -Timestamps "0,1.5,3".');
  if (items.length > 12) throw new Error('Refusing to extract more than 12 frames in one run. Keep visual review targeted.');
  if (items.some(item => !Number.isFinite(item) || item < 0)) throw new Error('Timestamps must be non-negative seconds.');
  return items;
}

async function captureFrame(page, sourceUrl, timestamp) {
  return page.evaluate(async ({ sourceUrl, timestamp }) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.style.position = 'fixed';
    video.style.left = '-99999px';
    document.body.appendChild(video);

    const once = (name, rejectName = 'error') => new Promise((resolve, reject) => {
      const cleanup = () => {
        video.removeEventListener(name, onOk);
        video.removeEventListener(rejectName, onError);
      };
      const onOk = () => { cleanup(); resolve(); };
      const onError = () => {
        cleanup();
        reject(new Error(video.error?.message || `Video event failed: ${rejectName}`));
      };
      video.addEventListener(name, onOk, { once: true });
      video.addEventListener(rejectName, onError, { once: true });
    });

    video.src = sourceUrl;
    await once('loadedmetadata');
    const duration = video.duration;
    const width = video.videoWidth;
    const height = video.videoHeight;

    if (!Number.isFinite(duration) || duration <= 0) throw new Error('Video duration is unavailable.');
    if (!width || !height) throw new Error('Video dimensions are unavailable.');
    if (timestamp > duration) throw new Error(`Timestamp ${timestamp}s exceeds duration ${duration.toFixed(3)}s.`);

    await once('loadeddata');

    const safeTime = Math.min(timestamp, Math.max(0, duration - 0.001));
    if (Math.abs(video.currentTime - safeTime) > 0.001) {
      const seeked = once('seeked');
      video.currentTime = safeTime;
      await seeked;
    }

    if ('requestVideoFrameCallback' in video) {
      await new Promise(resolve => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        video.requestVideoFrameCallback(done);
        setTimeout(done, 250);
      });
    } else {
      await new Promise(resolve => setTimeout(resolve, 80));
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.94);
    video.remove();

    return {
      dataUrl,
      duration,
      width,
      height,
      actualTime: safeTime,
    };
  }, { sourceUrl, timestamp });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const articleDirArg = args.articledir;
  const contentHash = String(args.contenthash || '').toLowerCase();
  const timestamps = parseTimestamps(args.timestamps);

  if (!articleDirArg) throw new Error('Missing -ArticleDir.');
  if (!/^[0-9a-f]{64}$/.test(contentHash)) throw new Error('ContentHash must be one 64-character SHA-256 value.');

  const config = loadConfig();
  const libraryRoot = path.resolve(config.archive.libraryRoot);
  const articleDir = path.resolve(articleDirArg);
  if (!inside(libraryRoot, articleDir)) throw new Error('ArticleDir must be one article inside the configured library root.');

  const archiveFile = path.join(articleDir, 'archive.json');
  if (!fs.existsSync(archiveFile)) throw new Error('archive.json is missing.');
  const archive = readJson(archiveFile);

  const matches = (Array.isArray(archive.media) ? archive.media : [])
    .filter(item => item.kind === 'video' && item.status === 'downloaded' && item.contentHash === contentHash);
  if (!matches.length) throw new Error(`No downloaded video in archive.json matches contentHash ${contentHash}.`);

  const sourceVideo = matches[0].localRelativePath;
  const sourcePath = path.resolve(articleDir, sourceVideo);
  if (!inside(articleDir, sourcePath) || !fs.existsSync(sourcePath)) throw new Error('Canonical source video is missing.');

  const folder = path.basename(articleDir);
  const sourceOccurrences = matches.map(item => ({
    mediaId: item.id,
    blockIds: item.blockIds || [],
    contexts: item.contexts || [],
    duplicateOf: item.duplicateOf || null,
  }));

  const outputDir = path.join(articleDir, 'explain', 'evidence', 'frames', contentHash);
  fs.mkdirSync(outputDir, { recursive: true });

  const { server, port } = await startViewer({ libraryRoot, host: '127.0.0.1', port: 0 });
  const browser = await chromium.launch({ headless: true, executablePath: detectChrome('auto') });

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
    const sourceUrl = `http://127.0.0.1:${port}/library/${encodeURIComponent(folder)}/${sourceVideo.split('/').map(encodeURIComponent).join('/')}`;

    const frames = [];
    let videoMeta = null;

    for (const timestamp of timestamps) {
      const captured = await captureFrame(page, sourceUrl, timestamp);
      videoMeta = {
        durationSeconds: captured.duration,
        width: captured.width,
        height: captured.height,
      };

      const base64 = captured.dataUrl.replace(/^data:image\/jpeg;base64,/, '');
      const buffer = Buffer.from(base64, 'base64');
      const milliseconds = Math.round(captured.actualTime * 1000);
      const name = `sha256-${contentHash}-t-${String(milliseconds).padStart(8, '0')}ms.jpg`;
      const output = path.join(outputDir, name);
      fs.writeFileSync(output, buffer);

      frames.push({
        requestedTimestampSeconds: timestamp,
        timestampSeconds: captured.actualTime,
        timestampMilliseconds: milliseconds,
        file: name,
        bytes: buffer.length,
        sha256: sha256(buffer),
      });
    }

    const manifest = {
      version: 1,
      contentHash,
      sourceVideo: sourceVideo.replace(/\\/g, '/'),
      sourceOccurrences,
      generatedAt: new Date().toISOString(),
      extractor: 'playwright-chromium-canvas',
      selection: 'explicit-timestamps',
      video: videoMeta,
      frames,
    };

    fs.writeFileSync(path.join(outputDir, 'frames.json'), JSON.stringify(manifest, null, 2), 'utf8');
    console.log(JSON.stringify(manifest, null, 2));
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
