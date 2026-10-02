const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

function sanitizeProfileName(name) {
  const value = String(name || 'default').trim();
  const safe = value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!safe) throw new Error('Invalid profile name.');
  return safe;
}

function detectChrome(configuredPath = 'auto') {
  if (configuredPath && configuredPath !== 'auto') {
    if (!fs.existsSync(configuredPath)) throw new Error(`Configured Chrome not found: ${configuredPath}`);
    return configuredPath;
  }

  const systemDrive = process.env.SystemDrive || 'C:';
  const candidates = [
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(systemDrive + path.sep, 'Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(systemDrive + path.sep, 'Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ].filter(Boolean);

  const found = candidates.find(fs.existsSync);
  if (!found) throw new Error('Google Chrome was not found. Configure browser.chromePath in config/local.json.');
  return found;
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

async function waitForCdp(port, timeoutMs = 15000) {
  const endpoint = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(1200) });
      if (response.ok) {
        const json = await response.json();
        if (json.webSocketDebuggerUrl) return endpoint;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }

  throw new Error(`Chrome DevTools endpoint did not become ready on port ${port}: ${lastError?.message || 'timeout'}`);
}

async function isCdpAlive(endpoint) {
  if (!endpoint) return false;
  try {
    const response = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(1200) });
    if (!response.ok) return false;
    const json = await response.json();
    return Boolean(json.webSocketDebuggerUrl);
  } catch {
    return false;
  }
}

async function launchProfile({
  chromePath,
  profileRoot,
  profileName,
  targetUrl = 'about:blank',
  diskCacheMB = 64,
  mediaCacheMB = 64,
}) {
  const safeProfile = sanitizeProfileName(profileName);
  const profileDir = path.join(profileRoot, safeProfile);
  fs.mkdirSync(profileDir, { recursive: true });

  const runtimeFile = path.join(profileDir, '.feishu-notes-cdp.json');
  try {
    const runtime = JSON.parse(fs.readFileSync(runtimeFile, 'utf8'));
    if (await isCdpAlive(runtime.cdpEndpoint)) {
      return {
        cdpEndpoint: runtime.cdpEndpoint,
        profileDir,
        profileName: safeProfile,
        chromePath: runtime.chromePath || detectChrome(chromePath),
        pid: runtime.pid || null,
        reused: true,
      };
    }
  } catch {
    // Missing, stale, or invalid runtime state: launch a fresh profile instance.
  }

  const port = await getFreePort();
  const chrome = detectChrome(chromePath);

  const args = [
    `--remote-debugging-port=${port}`,
    '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${profileDir}`,
    `--disk-cache-size=${Math.max(0, Number(diskCacheMB) || 0) * 1024 * 1024}`,
    `--media-cache-size=${Math.max(0, Number(mediaCacheMB) || 0) * 1024 * 1024}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--new-window',
    targetUrl,
  ];

  const child = spawn(chrome, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.unref();

  const cdpEndpoint = await waitForCdp(port);
  fs.writeFileSync(runtimeFile, JSON.stringify({
    cdpEndpoint,
    pid: child.pid,
    chromePath: chrome,
    updatedAt: new Date().toISOString(),
  }, null, 2), 'utf8');

  return { cdpEndpoint, profileDir, profileName: safeProfile, chromePath: chrome, pid: child.pid, reused: false };
}

module.exports = {
  detectChrome,
  getFreePort,
  launchProfile,
  sanitizeProfileName,
};
