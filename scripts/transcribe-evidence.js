const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { loadConfig } = require('../src/config/load-config');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (!raw.startsWith('-')) continue;
    const key = raw.replace(/^-+/, '').toLowerCase();
    const next = argv[i + 1];
    if (next == null || next.startsWith('-')) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function inside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function normalizeOccurrences(matches) {
  return matches.map(item => ({
    mediaId: item.id,
    blockIds: item.blockIds || [],
    contexts: item.contexts || [],
    duplicateOf: item.duplicateOf || null,
  }));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const articleDirArg = args.articledir;
  const contentHash = String(args.contenthash || '').toLowerCase();
  const asrRootArg = args.asrroot || process.env.FEISHU_NOTES_ASR_ROOT;
  const language = String(args.language || 'zh');
  const force = Boolean(args.force);

  if (!articleDirArg) throw new Error('Missing -ArticleDir.');
  if (!/^[0-9a-f]{64}$/.test(contentHash)) throw new Error('ContentHash must be one 64-character SHA-256 value.');
  if (!asrRootArg) throw new Error('Missing -AsrRoot or FEISHU_NOTES_ASR_ROOT.');

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

  const asrRoot = path.resolve(asrRootArg);
  const asrScript = path.join(asrRoot, 'scripts', 'asr.ps1');
  if (!fs.existsSync(asrScript)) throw new Error(`ASR script not found: ${asrScript}`);

  const outputDir = path.join(articleDir, 'explain', 'evidence', 'asr');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputFile = path.join(outputDir, `sha256-${contentHash}.asr.json`);

  if (fs.existsSync(outputFile) && !force) {
    const existing = readJson(outputFile);
    console.log(JSON.stringify({
      status: 'exists',
      outputFile,
      contentHash,
      model: existing?.asr?.model || null,
      durationSeconds: existing?.asr?.durationSeconds || null,
      segmentCount: Array.isArray(existing?.asr?.segments) ? existing.asr.segments.length : 0,
    }, null, 2));
    return;
  }

  const startedAt = new Date().toISOString();
  const powershellCommand = [
    '& {',
    'param($scriptPath,$inputPath,$requestedLanguage);',
    '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false);',
    '$OutputEncoding = [System.Text.UTF8Encoding]::new($false);',
    '& $scriptPath transcribe $inputPath -Language $requestedLanguage',
    '}',
  ].join(' ');

  const child = spawnSync('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-Command', powershellCommand,
    asrScript,
    sourcePath,
    language,
  ], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });

  if (child.error) throw child.error;
  if (child.status !== 0) {
    throw new Error(`ASR command failed with exit code ${child.status}: ${String(child.stderr || child.stdout || '').trim()}`);
  }

  const raw = String(child.stdout || '').trim().replace(/^\uFEFF/, '');
  if (!raw) throw new Error('ASR command returned no output.');

  let result;
  try {
    result = JSON.parse(raw);
  } catch (error) {
    throw new Error(`ASR command returned invalid JSON: ${error.message}`);
  }
  if (result.status !== 'ok' || !String(result.text || '').trim()) {
    throw new Error('ASR command returned no usable transcript.');
  }

  const sidecar = {
    version: 1,
    contentHash,
    sourceVideo: sourceVideo.replace(/\\/g, '/'),
    sourceOccurrences: normalizeOccurrences(matches),
    asr: {
      service: 'local-ASR-service',
      runner: 'scripts/asr.ps1 transcribe',
      model: result.model || null,
      language: result.language || language,
      durationSeconds: result.duration ?? null,
      createdAt: new Date().toISOString(),
      startedAt,
      text: result.text,
      rawText: result.raw_text || null,
      segmentsPunctuated: Boolean(result.segments_punctuated),
      segments: Array.isArray(result.segments) ? result.segments : [],
    },
  };

  fs.writeFileSync(outputFile, JSON.stringify(sidecar, null, 2), 'utf8');

  console.log(JSON.stringify({
    status: 'ok',
    outputFile,
    contentHash,
    model: sidecar.asr.model,
    durationSeconds: sidecar.asr.durationSeconds,
    segmentCount: sidecar.asr.segments.length,
    occurrenceCount: sidecar.sourceOccurrences.length,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
}
