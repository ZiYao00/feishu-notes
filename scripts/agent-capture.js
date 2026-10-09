#!/usr/bin/env node
'use strict';

// Agent-only, non-destructive entrypoint. The legacy CLI remains unchanged.
// Ordinary capture never overwrites. Resume may only complete matching pending/partial media.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { loadConfig } = require('../src/config/load-config');
const { assessManifestClaims,safeLocalFile } = require('../src/archive/quality-gate');

const RESULT_TAG = 'AGENT_CAPTURE_RESULT ';
const LOCK_NAME = 'agent-capture.lock';

function parseDocumentUrl(value) {
  let parsed;
  try { parsed = new URL(String(value || '')); } catch { throw new Error('Invalid Feishu URL.'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
      !/(^|\.)feishu\.cn$/i.test(parsed.hostname)) {
    throw new Error('Only authenticated https://*.feishu.cn document URLs are allowed.');
  }
  const match = /^\/(?:docx|docs|wiki)\/([a-zA-Z0-9_-]+)\/?$/.exec(parsed.pathname);
  if (!match) throw new Error('Expected a Feishu /docx/, /docs/ or /wiki/ document URL.');
  parsed.hash = '';
  return { url: parsed.toString(), documentId: match[1] };
}

function parseOptions(argv) {
  const command = argv[0];
  if (!['inspect', 'capture', 'resume'].includes(command)) {
    throw new Error('Usage: node scripts/agent-capture.js inspect|capture|resume <feishu-url> [--profile name] [--confirm-unknown]');
  }
  const inputUrl = argv[1];
  if (!inputUrl || inputUrl.startsWith('--')) throw new Error('A Feishu URL is required.');
  const args = { command, ...parseDocumentUrl(inputUrl), profile: 'default', confirmLarge: false, confirmUnknown: false };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--profile' && argv[i + 1] && !argv[i + 1].startsWith('--')) {
      args.profile = argv[++i];
    } else if (argv[i] === '--confirm-large' && ['capture', 'resume'].includes(command)) {
      args.confirmLarge = true;
    } else if (argv[i] === '--confirm-unknown' && command === 'resume') {
      args.confirmUnknown = true;
    } else {
      throw new Error('Unsupported flag: ' + argv[i] + '. Existing archives cannot be refreshed by this entrypoint.');
    }
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(args.profile) || args.profile.includes('..')) {
    throw new Error('Invalid Chrome profile name.');
  }
  return args;
}

function isInside(root, candidate) {
  const rel = path.relative(root, candidate);
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel);
}

function findArchive(libraryRoot, documentId) {
  if (!fs.existsSync(libraryRoot)) return null;
  for (const entry of fs.readdirSync(libraryRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(libraryRoot, entry.name);
    const file = path.join(dir, 'archive.json');
    if (!fs.existsSync(file)) continue;
    if (!fs.lstatSync(file).isFile()) throw new Error('Unsafe manifest in ' + entry.name);
    let archive;
    try { archive = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { throw new Error('Unreadable archive manifest in ' + entry.name + '. Stop to avoid duplicating data.'); }
    if (archive && archive.documentId === documentId) return { dir, archive };
  }
  return null;
}

function verifySavedArchive(found) {
  if (!found) return { valid: false, status: 'not_found', issues: ['No local archive exists.'] };
  const { dir, archive } = found;
  const claims=assessManifestClaims(archive);
  const issues = [...claims.issues];
  const warnings = [...claims.warnings];
  function checkFile(relative, label, expectedBytes, expectedSha256=null) {
    if (typeof relative !== 'string' || !relative.trim() || path.isAbsolute(relative)) {
      issues.push(label + ': missing or absolute path');
      return;
    }
    const resolved = path.resolve(dir, relative);
    if (!isInside(dir, resolved)) {
      issues.push(label + ': path escapes the archive');
      return;
    }
    try {
      const stat = fs.lstatSync(resolved);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0) {
        issues.push(label + ': file missing/empty/unsafe');
      } else if (Number.isFinite(expectedBytes) && stat.size !== expectedBytes) {
        issues.push(label + ': byte size differs from manifest');
      } else if(expectedSha256 && /^[0-9a-f]{64}$/i.test(expectedSha256)) {
        const fd=fs.openSync(resolved,'r');
        const hasher=crypto.createHash('sha256'),buffer=Buffer.alloc(256*1024);
        try { let count;while((count=fs.readSync(fd,buffer,0,buffer.length,null))>0)hasher.update(buffer.subarray(0,count)); }
        finally {fs.closeSync(fd)}
        if(hasher.digest('hex')!==expectedSha256)issues.push(label+': SHA-256 mismatch');
      }
    } catch {
      issues.push(label + ': file does not exist');
    }
  }
  checkFile(archive.markdownFile, 'Markdown');
  checkFile(archive.htmlFile || 'article.html', 'HTML');
  const media = Array.isArray(archive.media) ? archive.media : [];
  for (const item of media) {
    if (item.status !== 'downloaded') {
      warnings.push('Unresolved media: ' + String(item.id || item.kind || 'unknown'));
      continue;
    }
    checkFile(item.localRelativePath, 'Media ' + String(item.id || '?'), item.actualSize, item.contentHash);
    if(!/^[a-f0-9]{64}$/i.test(item.contentHash||'')) issues.push('Media '+String(item.id||'?')+': SHA-256 missing');
  }
  const sheets = Array.isArray(archive.embeddedSheets) ? archive.embeddedSheets : [];
  const failedSheets = sheets.filter(sheet => sheet.status === 'failed');
  if (failedSheets.length) warnings.push(failedSheets.length + ' embedded Sheet(s) could not be extracted.');
  if (archive.status !== 'complete') {
    issues.push('Archive status is ' + String(archive.status || 'unknown') + ', not complete.');
  }
  if (archive.scan && (!Number.isFinite(archive.scan.blockCount) || archive.scan.blockCount < 1)) {
    warnings.push('Scanner block count is missing/zero.');
  }
  let readerQaBound=false;
  const qaFile=path.join(dir,'.qa','latest.json');
  if(fs.existsSync(qaFile))try{
    const qa=JSON.parse(fs.readFileSync(safeLocalFile(dir,'.qa/latest.json'),'utf8'));
    const shaRelative=relative=>crypto.createHash('sha256').update(fs.readFileSync(safeLocalFile(dir,relative))).digest('hex');
    readerQaBound=qa.passed===true &&
      qa.manifestSha===shaRelative('archive.json') &&
      qa.contentDigests?.html===shaRelative(archive.htmlFile||'article.html') &&
      qa.contentDigests?.markdown===shaRelative(archive.markdownFile);
  }catch(error){warnings.push('Reader QA binding could not be verified: '+error.message)}
  return {
    valid: claims.valid && issues.length === 0 && warnings.length === 0,
    verdict:claims.valid?(readerQaBound?'complete_verified':'complete_candidate'):claims.verdict,
    deliveryCertified:claims.valid&&readerQaBound&&issues.length===0&&warnings.length===0,
    status: archive.status || 'unknown',
    folder: path.basename(dir),
    blockCount: archive.scan?.blockCount ?? null,
    mediaCount: media.length,
    localMediaCount: media.filter(item => item.status === 'downloaded').length,
    qualityVerified: archive.quality?.verified === true,
    unverifiedAttachments: archive.quality?.unresolvedAttachmentCount ?? null,
    failedSheets: failedSheets.length,
    issues,
    warnings,
  };
}

function report(status, fields = {}, exitCode = 0) {
  console.log(RESULT_TAG + JSON.stringify({ status, ...fields }));
  return exitCode;
}

function acquireLock(projectRoot, documentId) {
  const lockFile = path.join(projectRoot, 'data', 'state', LOCK_NAME);
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  let fd;
  try { fd = fs.openSync(lockFile, 'wx'); }
  catch (err) {
    if (err.code === 'EEXIST') throw new Error('A capture lock exists: data/state/' + LOCK_NAME + '. Do not auto-remove it; inspect the active task first.');
    throw err;
  }
  const token = crypto.randomUUID();
  const record = { token, pid: process.pid, documentId, startedAt: new Date().toISOString() };
  try {
    fs.writeFileSync(fd, JSON.stringify(record) + '\n', 'utf8');
  } catch (err) {
    fs.closeSync(fd);
    // Do not delete a lock on ambiguous ownership; manual inspection is safer.
    throw err;
  }
  fs.closeSync(fd);
  return function releaseOwnLock() {
    try {
      const current = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
      if (current.token === token && current.pid === process.pid) fs.unlinkSync(lockFile);
      else console.error('Capture lock ownership changed; not removing it.');
    } catch (err) {
      console.error('Capture lock could not be safely released: ' + err.message);
    }
  };
}

function spawnCapture(args) {
  return new Promise((resolve, reject) => {
    const command = [
      path.join(__dirname, '..', 'src', 'cli.js'),
      'capture',
      args.url,
      '--agent-safe',
      '--profile',
      args.profile,
    ];
    if (args.command === 'resume') command.push('--agent-resume');
    if (args.confirmLarge) command.push('--confirm-large');
    if (args.confirmUnknown) command.push('--confirm-unknown');
    const child = spawn(process.execPath, command, { cwd: path.resolve(__dirname, '..'), shell: false, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code, signal) => resolve({ code: code ?? 1, signal: signal || null }));
  });
}

async function main() {
  let args;
  try { args = parseOptions(process.argv.slice(2)); }
  catch (error) { return report('invalid_request', { error: error.message }, 8); }
  const config = loadConfig();
  const libraryRoot = path.resolve(config.archive.libraryRoot);
  let found;
  try { found = findArchive(libraryRoot, args.documentId); }
  catch (error) { return report('inspection_failed', { error: error.message }, 9); }
  if (args.command === 'inspect') {
    const verification = verifySavedArchive(found);
    return report(found ? 'existing' : 'not_found', { documentId: args.documentId, verification }, found && !verification.valid ? 5 : 0);
  }
  let releaseLock;
  try {
    releaseLock = acquireLock(config.projectRoot, args.documentId);
  } catch (error) {
    return report('locked', { error: error.message }, 6);
  }
  try {
    // Recheck after acquiring the global lock to close the agent-vs-agent race.
    found = findArchive(libraryRoot, args.documentId);
    if (args.command === 'capture' && found) {
      const verification = verifySavedArchive(found);
      return report('already_archived', { documentId: args.documentId, verification, modified: false }, verification.valid ? 0 : 5);
    }
    if (args.command === 'resume' && (!found || !['partial', 'pending_confirmation'].includes(found.archive.status))) {
      return report('not_resumable', { documentId: args.documentId, status: found?.archive?.status || 'missing', modified: false }, 5);
    }
    const run = await spawnCapture(args);
    const after = findArchive(libraryRoot, args.documentId);
    const verification = verifySavedArchive(after);
    if (run.code === 2) return report('login_required', { documentId: args.documentId, modified: false }, 2);
    if (run.code === 3) return report('permission_denied', { documentId: args.documentId, modified: false }, 3);
    if (run.code === 4) return report('pending_confirmation', { documentId: args.documentId, verification }, 4);
    if (run.code !== 0) return report(args.command === 'resume' ? 'resume_failed' : 'capture_failed', { documentId: args.documentId, cliCode: run.code, signal: run.signal, verification }, 9);
    if (!verification.valid || !verification.deliveryCertified) return report('needs_review', { documentId: args.documentId, verification }, 5);
    return report('complete_verified', { documentId: args.documentId, verification }, 0);
  } catch (error) {
    return report('capture_failed', { documentId: args.documentId, error: error.message }, 9);
  } finally {
    if (releaseLock) releaseLock();
  }
}

if (require.main === module) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    process.exitCode = report('unexpected_error', { error: error.message }, 9);
  });
}

module.exports = { parseDocumentUrl, parseOptions, findArchive, verifySavedArchive, acquireLock, report, RESULT_TAG };
