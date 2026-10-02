const fs = require('fs');
const path = require('path');

const CACHE_PATHS = [
  ['Default', 'Service Worker', 'CacheStorage'],
  ['Default', 'Cache'],
  ['Default', 'Code Cache'],
  ['Default', 'GPUCache'],
  ['Default', 'DawnWebGPUCache'],
  ['Default', 'DawnGraphiteCache'],
  ['optimization_guide_model_store'],
  ['Safe Browsing'],
  ['component_crx_cache'],
  ['WasmTtsEngine'],
  ['GrShaderCache'],
  ['ShaderCache'],
  ['GPUPersistentCache'],
];

function sizeOf(target) {
  if (!fs.existsSync(target)) return 0;
  const stat = fs.statSync(target);
  if (stat.isFile()) return stat.size;
  let total = 0;
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    total += sizeOf(path.join(target, entry.name));
  }
  return total;
}

async function endpointAlive(endpoint) {
  if (!endpoint) return false;
  try {
    const response = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(1200) });
    return response.ok;
  } catch {
    return false;
  }
}

async function cleanupProfileCache(profileDir) {
  const runtimeFile = path.join(profileDir, '.feishu-notes-cdp.json');
  try {
    const runtime = JSON.parse(fs.readFileSync(runtimeFile, 'utf8'));
    if (await endpointAlive(runtime.cdpEndpoint)) {
      throw new Error('Profile Chrome is still running. Close that account window before cleanup.');
    }
  } catch (error) {
    if (error.message.includes('still running')) throw error;
  }

  const before = sizeOf(profileDir);
  let removed = 0;

  for (const segments of CACHE_PATHS) {
    const target = path.join(profileDir, ...segments);
    if (!fs.existsSync(target)) continue;
    removed += sizeOf(target);
    fs.rmSync(target, { recursive: true, force: true });
  }

  const after = sizeOf(profileDir);
  return { before, after, removed };
}

module.exports = {
  CACHE_PATHS,
  cleanupProfileCache,
  sizeOf,
};
