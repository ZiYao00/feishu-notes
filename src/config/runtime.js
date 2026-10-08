const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const packageInfo = require('../../package.json');

function assertNodeVersion(version = process.versions.node) {
  const minimum = packageInfo.engines.node.match(/^>=(\d+)\.(\d+)\.(\d+)$/).slice(1).map(Number);
  const actual = String(version).replace(/^v/, '').split('.').map(Number);
  let supported = false;
  for (let index = 0; index < 3; index += 1) {
    if (actual[index] > minimum[index]) { supported = true; break; }
    if (actual[index] < minimum[index]) break;
    if (index === 2) supported = true;
  }
  if (!supported) throw new Error(`Node.js ${version} is unsupported. Install Node.js 24 LTS (required: ${packageInfo.engines.node}).`);
}

function assertDependencies() {
  for (const name of Object.keys(packageInfo.dependencies)) {
    try {
      const resolved = require.resolve(name, { paths: [PROJECT_ROOT] });
      const relative = path.relative(path.join(PROJECT_ROOT, 'node_modules'), resolved);
      if (relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('Dependency resolved outside this project.');
      require(resolved);
    } catch {
      throw new Error(`Project dependency ${name} is unavailable. In the project folder, run npm.cmd ci.`);
    }
  }
}

function assertRuntime() {
  assertNodeVersion();
  assertDependencies();
}

module.exports = { assertNodeVersion, assertDependencies, assertRuntime };
