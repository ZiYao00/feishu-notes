#!/usr/bin/env node
'use strict';
// Private, non-destructive audit of authorized Feishu content. No library writes.
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {loadConfig}=require('../src/config/load-config');
const {launchProfile}=require('../src/browser/browser-manager');
const {scanFeishuDocument}=require('../src/feishu/scanner');
const {acquireCaptureLock}=require('../src/archive/capture-lock');
const {parseDocumentUrl}=require('./agent-capture');
const {hashBytes,snapshotDocument,summarizeSnapshot,compareSnapshots}=require('../src/archive/source-snapshot');
const id=crypto.randomUUID().slice(0,8);
function writeJson(file,data){const temp=file+'.next-'+process.pid;fs.writeFileSync(temp,JSON.stringify(data,null,2));fs.renameSync(temp,file);}
function findArchive(root,documentId){
  for(const d of fs.readdirSync(root,{withFileTypes:true})){
    if(!d.isDirectory())continue;
    const f=path.join(root,d.name,'archive.json');
    if(!fs.existsSync(f))continue;
    const data=JSON.parse(fs.readFileSync(f,'utf8'));
    if(data.documentId===documentId)return {dir:path.join(root,d.name),manifest:data};
  }
  return null;
}
function preserveExisting(projectRoot,archive){
  const dir=path.join(projectRoot,'data','backups','source-audit-'+Date.now()+'-'+id);
  fs.mkdirSync(dir,{recursive:true});
  const files={manifest:'archive.json',html:archive.manifest.htmlFile||'article.html',markdown:archive.manifest.markdownFile};
  const result=[];
  for(const [key,name] of Object.entries(files)){
    const file=path.join(archive.dir,name);
    if(!fs.existsSync(file)||!fs.lstatSync(file).isFile())throw Error('Cannot protect original '+key);
    const bytes=fs.readFileSync(file),target=key==='markdown'?'original.md':key==='manifest'?'archive.json':'article.html';
    fs.writeFileSync(path.join(dir,target),bytes,{flag:'wx'});
    result.push({key,originalFile:name,backupFile:target,sha256:hashBytes(bytes),hashFormat:'sha256-bytes'});
  }
  writeJson(path.join(dir,'backup.json'),{originalFolder:path.basename(archive.dir),files:result});
  return {dir,files:result};
}
async function main(){
  const parsed=parseDocumentUrl(process.argv[2]);const config=loadConfig();
  const state=path.join(config.projectRoot,'data','tmp','source-audits',parsed.documentId);
  fs.mkdirSync(state,{recursive:true});
  const original=findArchive(path.resolve(config.archive.libraryRoot),parsed.documentId);
  if(!original)throw Error('Original archive not found; audit must not create one');
  const backup=preserveExisting(config.projectRoot,original);
  console.log(JSON.stringify({event:'source_audit_backup',files:backup.files.map(x=>({key:x.key,sha256:x.sha256}))}));
  const unlock=acquireCaptureLock(config.projectRoot,parsed.documentId);
  let browser;
  try{
    const launched=await launchProfile({chromePath:config.browser.chromePath,profileRoot:config.browser.profileRoot,
      profileName:'default',targetUrl:parsed.url,diskCacheMB:config.browser.diskCacheMB,mediaCacheMB:config.browser.mediaCacheMB});
    const result=await scanFeishuDocument({cdpEndpoint:launched.cdpEndpoint,targetUrl:parsed.url});
    browser=result.browser;
    if(result.document.loginRequired || result.document.permissionDenied)throw Error('Login/permission blocked');
    if(result.document.documentId!==parsed.documentId)throw Error('Wrong document ID');
    const snapshot=snapshotDocument(result.document);
    const filename='scan-'+Date.now()+'-'+id+'.json';
    const file=path.join(state,filename);
    writeJson(file,snapshot);
    const recent=fs.readdirSync(state).filter(n=>/^scan-[0-9]+-[a-f0-9]+\.json$/.test(n)).sort();
    const priorName=recent.length>1?recent[recent.length-2]:null;
    const compare=priorName?compareSnapshots(JSON.parse(fs.readFileSync(path.join(state,priorName),'utf8')),snapshot):null;
    writeJson(path.join(state,'audit-'+id+'.json'),{snapshotFile:filename,priorName,compare,summary:summarizeSnapshot(snapshot),backup:backup.dir});
    console.log(JSON.stringify({event:'source_audit_complete',snapshot:filename,summary:summarizeSnapshot(snapshot),compare}));
  }finally{
    if(browser)await browser.close().catch(()=>{});
    unlock();
  }
}
main().catch(e=>{console.error('SOURCE_AUDIT_FAILED: '+e.message);process.exitCode=1;});
