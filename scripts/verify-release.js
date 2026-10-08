const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { startViewer } = require('../src/viewer/server');
const { assertNodeVersion } = require('../src/config/runtime');

async function main() {
  assert.throws(() => assertNodeVersion('20.20.2'), /unsupported/);
  assert.throws(() => assertNodeVersion('22.11.0'), /unsupported/);
  assertNodeVersion('22.12.0');
  assertNodeVersion('24.20.0');
  const root = path.resolve(__dirname, '..', 'data', 'tmp', `release-range-${process.pid}`);
  const article = path.join(root, 'range-fixture');
  fs.mkdirSync(article, { recursive: true });
  const bytes = Buffer.from(Array.from({ length: 2048 }, (_, index) => index % 256));
  fs.writeFileSync(path.join(article, 'sample.mp4'), bytes);
  fs.writeFileSync(path.join(article, 'empty.mp4'), Buffer.alloc(0));
  const { server, port } = await startViewer({ libraryRoot: root, port: 0 });
  const url = `http://127.0.0.1:${port}/library/range-fixture/`;
  const cases = [
    ['bytes=0-15', 206, 'bytes 0-15/2048', bytes.subarray(0, 16)],
    ['bytes=2032-', 206, 'bytes 2032-2047/2048', bytes.subarray(-16)],
    ['bytes=-16', 206, 'bytes 2032-2047/2048', bytes.subarray(-16)],
    ['bytes=-4096', 206, 'bytes 0-2047/2048', bytes],
    ['bytes=2040-4096', 206, 'bytes 2040-2047/2048', bytes.subarray(2040)],
    ['bytes=2048-', 416, 'bytes */2048', Buffer.alloc(0)],
    ['bytes=4096-', 416, 'bytes */2048', Buffer.alloc(0)],
    ['bytes=-0', 416, 'bytes */2048', Buffer.alloc(0)],
    ['bytes=16-0', 200, null, bytes],
    ['bytes=-', 200, null, bytes],
    ['bytes=nope', 200, null, bytes],
    ['bytes=0-1,4-5', 200, null, bytes],
    ['bytes=9007199254740992-', 200, null, bytes],
  ];
  try {
    for (const [range, status, contentRange, expected] of cases) {
      const response = await fetch(url + 'sample.mp4', { headers: { Range: range } });
      assert.strictEqual(response.status, status, range);
      assert.strictEqual(response.headers.get('content-range'), contentRange, range);
      assert(Buffer.from(await response.arrayBuffer()).equals(expected), range);
      assert.strictEqual(Number(response.headers.get('content-length')), expected.length, range);
    }
    const empty = await fetch(url + 'empty.mp4', { headers: { Range: 'bytes=0-' } });
    assert.strictEqual(empty.status, 416);
    assert.strictEqual(empty.headers.get('content-range'), 'bytes */0');
    assert.strictEqual((await empty.arrayBuffer()).byteLength, 0);
    const head = await fetch(url + 'sample.mp4', { method: 'HEAD', headers: { Range: 'bytes=-16' } });
    assert.strictEqual(head.status, 200);
    assert.strictEqual(head.headers.get('content-range'), null);
    assert.strictEqual(head.headers.get('content-length'), '2048');
    assert.strictEqual((await head.arrayBuffer()).byteLength, 0);
    console.log(JSON.stringify({ ok: true, rangeCases: cases.length + 2, versionBoundaries: 4, fixture: root }));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
