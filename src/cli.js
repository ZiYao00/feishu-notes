#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { loadConfig } = require('./config/load-config');
const { launchProfile, detectChrome, sanitizeProfileName } = require('./browser/browser-manager');
const { cleanupProfileCache, sizeOf } = require('./browser/profile-maintenance');
const { scanFeishuDocument } = require('./feishu/scanner');
const { buildMediaInventory, evaluateMediaPolicy } = require('./feishu/media-inventory');
const { createArchive } = require('./archive/archive-writer');
const { startViewer } = require('./viewer/server');

function parseArgs(argv) {
  const args = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value.startsWith('--')) {
      const key = value.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
    } else {
      args.push(value);
    }
  }
  return { args, flags };
}

function formatBytes(bytes) {
  if (bytes == null) return 'unknown';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index ? 1 : 0)} ${units[index]}`;
}

async function capture(targetUrl, flags) {
  if (!targetUrl) throw new Error('Usage: node src/cli.js capture <feishu-doc-url> [--profile default] [--confirm-large]');

  const config = loadConfig();
  const profileName = flags.profile || 'default';
  let cdpEndpoint = flags.cdp || null;
  let launched = null;

  if (!cdpEndpoint) {
    launched = await launchProfile({
      chromePath: config.browser.chromePath,
      profileRoot: config.browser.profileRoot,
      profileName,
      targetUrl,
      diskCacheMB: config.browser.diskCacheMB,
      mediaCacheMB: config.browser.mediaCacheMB,
    });
    cdpEndpoint = launched.cdpEndpoint;
    console.log(`Chrome profile: ${launched.profileDir}`);
  }

  console.log(`CDP: ${cdpEndpoint}`);
  const result = await scanFeishuDocument({ cdpEndpoint, targetUrl });
  const { browser, context, page, document } = result;

  try {
    if (document.loginRequired) {
      console.log('LOGIN_REQUIRED');
      console.log('A dedicated Chrome window is open. Sign in there, then run the same command again.');
      process.exitCode = 2;
      return;
    }

    if (document.permissionDenied) {
      console.log('PERMISSION_DENIED');
      console.log('The active profile cannot access this document. Try another named profile.');
      process.exitCode = 3;
      return;
    }

    console.log(`Title: ${document.title}`);
    console.log(`Blocks: ${document.scan.blockCount}, scans: ${document.scan.scans}, height: ${document.scan.maxHeightSeen}`);

    const inventory = await buildMediaInventory({ document, context, page });
    const policy = evaluateMediaPolicy(inventory, config.mediaLimits);

    for (const diagnostic of inventory.diagnostics || []) {
      console.log(`IGNORED [${diagnostic.type}] transient ${diagnostic.kind} resource from Feishu UI.`);
    }
    console.log(`Media: ${inventory.length}, known total: ${formatBytes(policy.knownTotal)}, unknown: ${policy.unknownCount}`);
    for (const warning of policy.warnings) console.log(`WARNING [${warning.type}] ${warning.message}`);

    const archive = await createArchive({
      document,
      inventory,
      policy,
      context,
      page,
      archiveConfig: config.archive,
      libraryRoot: config.archive.libraryRoot,
      confirmLarge: Boolean(flags['confirm-large']),
    });

    console.log(`Archive status: ${archive.status}`);
    console.log(`Archive: ${archive.archiveDir}`);

    if (launched?.profileDir && config.browser.profileWarnMB) {
      const profileBytes = sizeOf(launched.profileDir);
      const warnBytes = Number(config.browser.profileWarnMB) * 1024 * 1024;
      if (profileBytes > warnBytes) {
        console.log(`WARNING [profile_size] Profile cache/state is ${formatBytes(profileBytes)}. Close its Chrome window and run cleanup --profile ${profileName}.`);
      }
    }

    if (archive.warningsRequireConfirmation) {
      console.log('Media bulk download did not start because a soft limit was triggered.');
      console.log('Review archive.json, then rerun with --confirm-large to download all configured media.');
      process.exitCode = 4;
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

async function serve(flags) {
  const config = loadConfig();
  const host = flags.host || config.viewer.host || '127.0.0.1';
  const port = Number(flags.port || config.viewer.port || 4173);
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
    throw new Error('Viewer host must be loopback unless the project policy is explicitly changed.');
  }
  const { server } = await startViewer({ libraryRoot: config.archive.libraryRoot, host, port });
  console.log(`feishu-notes viewer: http://${host}:${port}`);
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

async function cleanup(flags) {
  const config = loadConfig();
  const profileName = sanitizeProfileName(flags.profile || 'default');
  const profileDir = path.join(config.browser.profileRoot, profileName);

  if (!fs.existsSync(profileDir)) {
    throw new Error(`Profile does not exist: ${profileName}`);
  }

  const result = await cleanupProfileCache(profileDir);
  console.log(JSON.stringify({
    profile: profileName,
    before: formatBytes(result.before),
    removed: formatBytes(result.removed),
    after: formatBytes(result.after),
  }, null, 2));
}

async function check() {
  const config = loadConfig();
  const chrome = detectChrome(config.browser.chromePath);
  fs.mkdirSync(config.browser.profileRoot, { recursive: true });
  fs.mkdirSync(config.archive.libraryRoot, { recursive: true });

  console.log(JSON.stringify({
    projectRoot: config.projectRoot,
    chromeFound: Boolean(chrome),
    profileRootExists: fs.existsSync(config.browser.profileRoot),
    libraryRootExists: fs.existsSync(config.archive.libraryRoot),
    libraryRootIsInsideProject: path.resolve(config.archive.libraryRoot).startsWith(path.resolve(config.projectRoot) + path.sep),
  }, null, 2));
}

async function main() {
  const { args, flags } = parseArgs(process.argv.slice(2));
  const command = args.shift();

  if (command === 'capture') return capture(args[0], flags);
  if (command === 'serve') return serve(flags);
  if (command === 'cleanup') return cleanup(flags);
  if (command === 'check') return check();

  console.log('feishu-notes');
  console.log('  capture <url> [--profile name] [--cdp endpoint] [--confirm-large]');
  console.log('  serve [--port 4173]');
  console.log('  cleanup [--profile default]');
  console.log('  check');
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
