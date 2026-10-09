'use strict';
const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {evaluateQuality,assessManifestClaims,summarizeManifest,verifyStoredArchive}=require('../src/archive/quality-gate');
const {renderDocument}=require('../src/archive/render-document');
const {verifySavedArchive}=require('./agent-capture');
const root=path.resolve(__dirname,'..','data','tmp','quality-gate-'+process.pid+'-'+crypto.randomUUID().slice(0,8));
let passed=0;
async function check(name,fn){await fn();passed++;console.log('PASS '+name)}
const make=(text='Hello')=>{
 const document={title:'Fixture',documentId:'QGTEST',scan:{verifiedComplete:true,blockCount:1},
   blocks:[{id:'1',className:'docx-heading2-block',text,html:'<h2>'+text+'</h2>',media:[]}]};
 return {document,audit:renderDocument({document,inventory:[]}).audit};
};
async function main(){
 await check('one quality verdict controls status and negative claims',()=>{
  const {document,audit}=make();
  const clean=evaluateQuality({document,audit,inventory:[]});
  assert.equal(clean.status,'complete');assert.equal(clean.verified,true);
  assert.equal(clean.deliveryCertified,false);
  const manifest={status:clean.status,scan:document.scan,quality:clean,media:[]};
  assert.equal(assessManifestClaims(manifest).valid,true);
  assert.equal(summarizeManifest(manifest).mediaCount,0);
  const bad=evaluateQuality({document,audit:{...audit,failed:1},inventory:[]});
  assert.equal(bad.status,'partial');assert.equal(bad.verified,false);
 });
 await check('unresolved attachment prevents complete report',()=>{
  const {document,audit}=make();
  const qa=evaluateQuality({document,audit:{...audit,unsupportedVisible:1,attachmentCandidates:[{blockId:'1',name:'file.zip',status:'unresolved'}]},inventory:[]});
  assert.equal(qa.status,'partial');assert.equal(qa.unresolvedAttachmentCount,1);
  assert.equal(qa.verdict,'partial_candidate');
 });
 await check('hash fields required before declaring downloaded media',()=>{
  const {document,audit}=make();
  const qa=evaluateQuality({document,audit,inventory:[{id:'media1',kind:'image',status:'downloaded',blockIds:['1'],localRelativePath:'assets/a.png'}]});
  assert.equal(qa.status,'partial');assert(qa.issues.includes('unverifiable_downloaded_media'));
 });
 await check('Callout source requires explicit nested virtual coverage',()=>{
  const doc={title:'Virtual',documentId:'CALLOUT',scan:{verifiedComplete:true,blockCount:1},blocks:[
    {id:'13',recordId:'record-stable',className:'docx-callout-block',text:'Content',
      html:'<div class="docx-callout-block">Content</div>',media:[]}]};
  const audit=renderDocument({document:doc,inventory:[]}).audit;
  const missing=evaluateQuality({document:doc,audit,inventory:[]});
  assert(missing.issues.includes('callout_content_unverified'));
  assert.equal(missing.status,'partial');
  const complete={...doc,scan:{...doc.scan,calloutCoverage:{total:1,resolved:1,unresolved:[],reconstructionErrors:[]}}};
  const quality=evaluateQuality({document:complete,audit,inventory:[]});
  assert.equal(quality.issues.includes('callout_content_unverified'),false);
 });
 await check('historical media reuse cannot be mistaken for certified current-source bytes',()=>{
   const {document,audit}=make();
   const policy={provisionalAssetReuse:true};
   const quality=evaluateQuality({document,audit,inventory:[],policy});
   assert.equal(quality.verified,false);
   assert.equal(quality.verdict,'unverified');
   assert(quality.issues.includes('historical_media_bytes_unverified'));
   const manifest={status:quality.status,scan:document.scan,quality,media:[],policy};
   const claims=assessManifestClaims(manifest);
   assert(claims.issues.includes('historical_media_bytes_unverified'));
   assert.equal(claims.valid,false);
  });
  await check('wrong attachment, link, and media state counts cannot claim success',()=>{
  const {document,audit}=make();
  const qa=evaluateQuality({document,audit,inventory:[]});
  const manifest={status:'complete',scan:document.scan,media:[{id:'im',status:'failed'}],quality:qa};
  assert.equal(assessManifestClaims(manifest).valid,false);
  assert(assessManifestClaims(manifest).issues.includes('media_state_counts_stale'));
 });
 await check('manifest evidence and actual file/hash consistency are separate',async()=>{
  const {document,audit}=make();
  const quality=evaluateQuality({document,audit,inventory:[]});
  fs.mkdirSync(root,{recursive:true});
  fs.writeFileSync(path.join(root,'original.md'),'Source markdown');
  fs.writeFileSync(path.join(root,'article.html'),'<article>Source</article>');
  let manifest={documentId:'QGTEST',status:'complete',markdownFile:'original.md',htmlFile:'article.html',scan:document.scan,quality,media:[],embeddedSheets:[]};
  fs.writeFileSync(path.join(root,'archive.json'),JSON.stringify(manifest));
  let check=await verifyStoredArchive({dir:root,manifest});
  assert.equal(check.valid,true);
  assert.equal(check.deliveryCertified,false);
  assert.equal(verifySavedArchive({dir:root,archive:manifest}).valid,true);
  assert.equal(verifySavedArchive({dir:root,archive:manifest}).deliveryCertified,false);
  manifest.quality.readerQa={passed:true};manifest.quality.deliveryCertified=true;
  // If only the manifest changes, no external Reader QA record exists: this must
  // not be confused with verified physical/visual acceptance.
  assert.equal(verifySavedArchive({dir:root,archive:manifest}).deliveryCertified,false,'Manifest booleans must never impersonate hash-bound browser QA');
  manifest.media=[{id:'m',kind:'image',status:'downloaded',localRelativePath:'assets/m.png',contentHash:'a'.repeat(64),actualSize:3}];
  fs.mkdirSync(path.join(root,'assets'),{recursive:true});
  fs.writeFileSync(path.join(root,'assets','m.png'),'bad');
  const invalid=await verifyStoredArchive({dir:root,manifest});
  assert.equal(invalid.valid,false);
  assert(invalid.issues.some(s=>s.includes('sha256')));
 });
 console.log('PASS '+passed+'/'+passed+' quality-gate checks');
}
main().catch(err=>{console.error(err.stack||err);process.exitCode=1});
