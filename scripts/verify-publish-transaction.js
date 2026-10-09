'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const assert=require('node:assert/strict');
const {publishArchiveFiles,inspectPublication,recoverPublication}=require('../src/archive/publish-transaction');
const {startViewer}=require('../src/viewer/server');
const base=path.resolve(__dirname,'..','data','tmp','publish-tx-verify-'+process.pid+'-'+crypto.randomUUID().slice(0,8));
const libraryRoot=path.join(base,'library'),dir=path.join(libraryRoot,'fixture');
const write=fs.writeFileSync;
const old={markdown:'old content',html:'<article data-reader-article>old content</article>',
 manifest:JSON.stringify({documentId:'TXFIXTURE',title:'Tx fixture',markdownFile:'original.md',
 htmlFile:'article.html',status:'partial',media:[]})};
const next={markdown:'new content',html:'<article data-reader-article>new content</article>',
 manifest:JSON.stringify({documentId:'TXFIXTURE',title:'Tx fixture',markdownFile:'original.md',
 htmlFile:'article.html',status:'complete',media:[]})};
const files={markdown:'original.md',html:'article.html',manifest:'archive.json'};
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,p))).digest('hex');
function original(){fs.mkdirSync(dir,{recursive:true});for(const k of Object.keys(files))write(path.join(dir,files[k]),old[k]);}
let passed=0;
async function test(label,fn){await fn();passed++;console.log('PASS '+label)}
async function main(){
 await test('three-file publication with verified backup and no lingering lock',()=>{
  original();
  const done=publishArchiveFiles({dir,files,contents:next,projectRoot:base});
  assert(done.published);assert(fs.existsSync(path.join(done.backupDir,'journal.json')));
  assert.equal(inspectPublication(dir).blocked,false);
  assert.equal(fs.readFileSync(path.join(dir,'original.md'),'utf8'),'new content');
 });
 await test('injected mid-publish crash blocks Reader, allows explicit restoration',async()=>{
  original();
  const before=Object.values(files).map(sha);
  assert.throws(()=>publishArchiveFiles({dir,files,contents:next,projectRoot:base,failureAfter:'html'}),/SIMULATED_INTERRUPT/);
  assert.equal(inspectPublication(dir).blocked,true);
  const server=await startViewer({libraryRoot,host:'127.0.0.1',port:0});
  try{
   const res=await fetch('http://127.0.0.1:'+server.port+'/note/fixture/');
   assert.equal(res.status,503);
   const asset=await fetch('http://127.0.0.1:'+server.port+'/library/fixture/article.html');
   assert.equal(asset.status,503);
  }finally{await new Promise(resolve=>server.server.close(resolve))}
  assert.equal(recoverPublication({dir,decision:'restore'}).restored,true);
  assert.equal(inspectPublication(dir).blocked,false);
  assert.deepEqual(Object.values(files).map(sha),before);
 });
 await test('blocked transaction rejects conflicting publish and unsafe recovery',()=>{
  original();
  assert.throws(()=>publishArchiveFiles({dir,files,contents:next,projectRoot:base,failureAfter:'markdown'}));
  assert.throws(()=>publishArchiveFiles({dir,files,contents:next,projectRoot:base}),/PUBLISH_INTERRUPTED/);
  assert.throws(()=>recoverPublication({dir,decision:'guess'}),/EXPLICIT/);
  fs.writeFileSync(path.join(dir,'original.md'),'external modification');
  assert.throws(()=>recoverPublication({dir,decision:'restore'}),/EXTERNAL_CHANGE/);
  // Last test intentionally leaves isolated fixture blocked as evidence.
 });
 console.log('PASS '+passed+'/'+passed+' publication/Reader safety checks; fixture='+base);
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1});
