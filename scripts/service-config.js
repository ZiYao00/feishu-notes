const { assertNodeVersion, assertDependencies } = require('../src/config/runtime');
const { loadConfig } = require('../src/config/load-config');

try {
  assertNodeVersion();
  if (process.argv.includes('--check-dependencies')) assertDependencies();
  const config = loadConfig();
  const host = config.viewer.host || '127.0.0.1';
  const port = Number(config.viewer.port || 4173);
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('Viewer host must be loopback.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Service viewer port must be an integer from 1 to 65535.');
  console.log(JSON.stringify({ host, port, url: `http://${host === '::1' ? '[::1]' : host}:${port}` }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
