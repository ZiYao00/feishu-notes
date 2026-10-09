'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  parseDocumentUrl,
  parseOptions,
  verifySavedArchive,
  acquireLock,
} = require('./agent-capture');

const root = path.resolve(__dirname, '..');
const tests = [];

function check(name, fn) {
  try {
    fn();
    console.log('PASS ' + name);
    tests.push(true);
  } catch (error) {
    console.error('FAIL ' + name + ': ' + error.message);
    tests.push(false);
  }
}

check('Feishu URL validation and document ID', () => {
  const id = 'TEST_DOC_ID_123';
  const result = parseDocumentUrl('https://example.feishu.cn/docx/' + id + '#anchor');
  assert.equal(result.documentId, id);
  assert.equal(result.url, 'https://example.feishu.cn/docx/' + id);
  assert.equal(parseDocumentUrl('https://example.feishu.cn/wiki/' + id).documentId, id);
  for (const bad of [
    'http://example.feishu.cn/docx/' + id,
    'https://evilfeishu.cn/docx/' + id,
    'https://example.feishu.cn@attacker.invalid/docx/' + id,
    'https://example.feishu.cn/docx/' + id + '/extra',
    'https://example.feishu.cn/anything/' + id,
    'file:///G:/notes/docx/' + id,
  ]) assert.throws(() => parseDocumentUrl(bad));
});

check('Safe options reject refresh and unknown flags', () => {
  const url = 'https://example.feishu.cn/docx/TEST';
  assert.equal(parseOptions(['capture', url]).profile, 'default');
  assert.equal(parseOptions(['capture', url, '--profile', 'work', '--confirm-large']).confirmLarge, true);
  assert.throws(() => parseOptions(['capture', url, '--refresh']));
  assert.throws(() => parseOptions(['capture', url, '--profile', '../unsafe']));
  assert.throws(() => parseOptions(['inspect', url, '--confirm-large']));
});

check('Read-only archive verification detects partial and traversal', () => {
  const found = {
    dir: root,
    archive: { status: 'complete', markdownFile: 'README.md', htmlFile: 'AGENTS.md', media: [], embeddedSheets: [] },
  };
  assert.equal(verifySavedArchive(found).valid, false, 'Legacy complete cannot be certified without quality evidence');
  found.archive.documentId='TEST';
  found.archive.scan={verifiedComplete:true,blockCount:1};
  found.archive.quality={schema:3,verified:true,sourceScanVerified:true,issues:[],
    blockCoverage:{totalBlocks:1,failed:0},mediaCounts:{},unresolvedAttachmentCount:0,
    unresolvedMediaCount:0,mediaDiscoveryErrors:0,sheetErrors:0};
  assert.equal(verifySavedArchive(found).valid, true,'quality data plus local files should be structurally valid');
  assert.equal(verifySavedArchive(found).deliveryCertified,false,'Reader acceptance required for delivery');
  found.archive.media = [{ id: 'missing', status: 'failed' }];
  assert.equal(verifySavedArchive(found).valid, false);
  found.archive.media = [];
  found.archive.markdownFile = '../README.md';
  assert.equal(verifySavedArchive(found).valid, false);
  found.archive.markdownFile = 'README.md';
  found.archive.embeddedSheets = [{ status: 'failed' }];
  assert.equal(verifySavedArchive(found).valid, false);
});

check('Atomic capture lock refuses second owner and releases exactly one file', () => {
  const isolatedRoot = path.join(root, 'data', 'tmp', 'agent-capture-lock-fixture-' + process.pid);
  const lockFile = path.join(isolatedRoot, 'data', 'state', 'agent-capture.lock');
  assert.equal(fs.existsSync(lockFile), false, 'Test fixture must be new and isolated');
  const release = acquireLock(isolatedRoot, 'verification-fixture');
  try {
    assert.equal(fs.existsSync(lockFile), true);
    assert.throws(() => acquireLock(isolatedRoot, 'second-agent'), /capture lock exists/i);
  } finally {
    release();
  }
  assert.equal(fs.existsSync(lockFile), false);
});

if (tests.some(ok => !ok)) process.exitCode = 1;
else console.log('PASS ' + tests.length + '/' + tests.length + ' agent capture checks');
