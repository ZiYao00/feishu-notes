const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function readJson(file, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

function mergeDeep(base, override) {
  if (!override || typeof override !== 'object' || Array.isArray(override)) return base;
  const out = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      base[key] &&
      typeof base[key] === 'object' &&
      !Array.isArray(base[key])
    ) {
      out[key] = mergeDeep(base[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function resolveProjectPath(value) {
  if (!value) return value;
  return path.isAbsolute(value) ? value : path.resolve(PROJECT_ROOT, value);
}

function loadConfig() {
  const defaults = readJson(path.join(PROJECT_ROOT, 'config', 'default.json'));
  const local = readJson(path.join(PROJECT_ROOT, 'config', 'local.json'));
  const config = mergeDeep(defaults, local);

  return {
    ...config,
    projectRoot: PROJECT_ROOT,
    browser: {
      ...config.browser,
      profileRoot: resolveProjectPath(config.browser.profileRoot),
    },
    archive: {
      ...config.archive,
      libraryRoot: resolveProjectPath(config.archive.libraryRoot),
    },
  };
}

module.exports = { PROJECT_ROOT, loadConfig, resolveProjectPath };
