'use strict';
// Regression coverage for immutable old/new source-audit backup formats.
// All fixtures stay inside the Git-ignored data/tmp directory.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('node:assert/strict');
const {verifySourceProtection}=require('./verify-source-protection');
const {hash,hashBytes}=require('../src/archive/source-snapshot');
const fixtureRoot=path.resolve(__dirname,'..','data','tmp','verify-source-protection-'+process.pid+'-'+crypto.randomUUID().slice(0,8));
const originals={
 manifest:Buffer.from('{"documentId":"SOURCE-PROTECTION-FIXTURE","media":[],"status":"pending_confirmation"}','utf8'),
 html:Buffer.from('<article><p>Source archive backup integrity</p></article>','utf8'),
 markdown:Buffer.from('# Source archive backup integrity\n\nPrivate markdown fixture','utf8'),
};
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS '+name)}
function make({kind='legacy',documentId='SOURCE-PROTECTION-FIXTURE'}={}){
 const id=crypto.randomUUID().replace(/-/g,'').slice(0,9),root=path.join(fixtureRoot,id);
 const libraryRoot=path.join(root,'library'),originalDir=path.join(libraryRoot,'article');
 const backupDir=path.join(root,'data','backups','source-audit-20261009-'+id);
 fs.mkdirSync(originalDir,{recursive:true});fs.mkdirSync(backupDir,{recursive:true});
 const records=[];
 for(const [key,buf] of Object.entries(originals)){
  const originalFile=key==='manifest'?'archive.json':key==='markdown'?'article.md':'article.html';
  const backupFile=key==='markdown'?'original.md':originalFile;
  const value=key==='manifest'?Buffer.from(JSON.stringify({documentId,media:[],status:'pending_confirmation'})):buf;
  fs.writeFileSync(path.join(originalDir,originalFile),value);
  fs.writeFileSync(path.join(backupDir,backupFile),value);
  const record={key,originalFile,backupFile,sha256:kind==='legacy'?hash(value):hashBytes(value)};
  if(kind==='raw')record.hashFormat='sha256-bytes';
  records.push(record);
 }
 const descriptor={originalFolder:'article',files:records};
 fs.writeFileSync(path.join(backupDir,'backup.json'),JSON.stringify(descriptor,null,2));
 return {root,libraryRoot,originalDir,backupDir,descriptor,
  verify:()=>verifySourceProtection({projectRoot:root,libraryRoot,documentId})};
}
(async()=>{
 await test('raw-byte SHA256 and legacy Buffer-JSON hashes are distinguishable',()=>{
  const value=Buffer.from('raw bytes \u0000 \u00e9');
  assert.equal(hashBytes(value),crypto.createHash('sha256').update(value).digest('hex'));
  assert.notEqual(hash(value),hashBytes(value));
 });
 await test('legacy backup verifies byte-for-byte without rewriting metadata',()=>{
  const a=make({kind:'legacy'}),metadataBefore=fs.readFileSync(path.join(a.backupDir,'backup.json'));
  const result=a.verify();
  assert.equal(result.originalUnchanged,true);
  assert.equal(result.files.length,3);
  assert(result.files.every(f=>f.valid&&f.byteIdentical&&f.hashFormat==='legacy-buffer-json'));
  assert(metadataBefore.equals(fs.readFileSync(path.join(a.backupDir,'backup.json'))));
 });
 await test('new backup uses canonical raw-byte SHA256',()=>{
  const a=make({kind:'raw'});
  const result=a.verify();
  assert.equal(result.originalUnchanged,true);
  assert(result.files.every(f=>f.valid&&f.hashFormat==='sha256-bytes'));
 });
 await test('an original changed to different bytes of the same size is rejected',()=>{
  const a=make({kind:'legacy'});
  const file=path.join(a.originalDir,'article.html');
  const body=fs.readFileSync(file);
  body[body.length-2]^=1;fs.writeFileSync(file,body);
  const result=a.verify();
  assert.equal(result.originalUnchanged,false);
  assert.equal(result.files.find(f=>f.key==='html').error,'original_differs_from_immutable_backup');
 });
 await test('a tampered backup is rejected even when original is intact',()=>{
  const a=make({kind:'raw'});
  fs.writeFileSync(path.join(a.backupDir,'original.md'),'bad');
  const result=a.verify();
  assert.equal(result.originalUnchanged,false);
  assert.equal(result.files.find(f=>f.key==='markdown').error,'backup_metadata_hash_mismatch');
 });
 await test('a forged metadata digest cannot make a backup pass',()=>{
  const a=make({kind:'raw'});
  a.descriptor.files[0].sha256='0'.repeat(64);
  fs.writeFileSync(path.join(a.backupDir,'backup.json'),JSON.stringify(a.descriptor));
  assert.equal(a.verify().originalUnchanged,false);
 });
 await test('raw-only format rejects a legacy fingerprint',()=>{
  const a=make({kind:'legacy'});
  a.descriptor.files[0].hashFormat='sha256-bytes';
  fs.writeFileSync(path.join(a.backupDir,'backup.json'),JSON.stringify(a.descriptor));
  assert.equal(a.verify().originalUnchanged,false);
 });
 await test('missing or traversal backup paths fail closed',()=>{
  const a=make({kind:'legacy'});
  fs.unlinkSync(path.join(a.backupDir,'original.md'));
  assert.equal(a.verify().originalUnchanged,false);
  const b=make({kind:'raw'});
  b.descriptor.files[0].backupFile='../outside.json';
  fs.writeFileSync(path.join(b.backupDir,'backup.json'),JSON.stringify(b.descriptor));
  const bad=b.verify().files.find(f=>f.key==='manifest');
  assert.equal(bad.valid,false);
  assert.equal(bad.error,'UNSAFE_BACKUP_FILE_NAME');
 });
 console.log('PASS '+passed+'/'+passed+' backup-hash compatibility checks; fixture='+fixtureRoot);
})().catch(error=>{console.error(error.stack||error);process.exitCode=1});
