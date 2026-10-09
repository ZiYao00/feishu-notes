#!/usr/bin/env node
'use strict';
// Read-only source backup protection check. Supports audit backups created
// before the raw-byte SHA-256 fix, without changing any historical metadata.
const fs=require('fs');
const path=require('path');
const {loadConfig}=require('../src/config/load-config');
const {hash,hashBytes}=require('../src/archive/source-snapshot');

function safeChild(root,name){
  if(typeof name!=='string'||!name||path.basename(name)!==name||name==='.'||name==='..'||path.isAbsolute(name))
    throw Error('UNSAFE_BACKUP_FILE_NAME');
  const parent=fs.realpathSync(root);
  const dest=path.resolve(parent,name);
  if(path.dirname(dest)!==parent)throw Error('UNSAFE_BACKUP_FILE_NAME');
  if(fs.existsSync(dest)&&fs.lstatSync(dest).isSymbolicLink())throw Error('UNSAFE_BACKUP_SYMLINK');
  return dest;
}
function checkFile({originalRoot,backupRoot,entry}){
  const result={key:entry?.key||'unknown',valid:false};
  try{
    if(!entry||typeof entry.sha256!=='string'||!/^[0-9a-f]{64}$/i.test(entry.sha256))
      throw Error('invalid_backup_fingerprint');
    const originalFile=safeChild(originalRoot,entry.originalFile);
    const backupFile=safeChild(backupRoot,entry.backupFile);
    const original=fs.readFileSync(originalFile),saved=fs.readFileSync(backupFile);
    const newSha=hashBytes(saved);
    const legacySha=hash(saved); // Legacy bug: SHA256(JSON.stringify(Buffer))
    let format=null;
    if(entry.hashFormat==='sha256-bytes'){
      if(entry.sha256.toLowerCase()===newSha)format='sha256-bytes';
    }else if(!entry.hashFormat){
      if(entry.sha256.toLowerCase()===newSha)format='sha256-bytes';
      else if(entry.sha256.toLowerCase()===legacySha)format='legacy-buffer-json';
    }else{
      throw Error('unsupported_backup_hash_format');
    }
    result.backupBytes=saved.length;
    result.originalBytes=original.length;
    result.hashFormat=format||'invalid';
    result.metadataValid=Boolean(format);
    result.byteIdentical=saved.equals(original);
    result.valid=result.metadataValid&&result.byteIdentical;
    if(!result.metadataValid)result.error='backup_metadata_hash_mismatch';
    else if(!result.byteIdentical)result.error='original_differs_from_immutable_backup';
  }catch(error){
    result.error=String(error.code||error.message||error);
  }
  return result;
}
function verifySourceProtection({projectRoot,libraryRoot,documentId}){
  if(!/^[a-zA-Z0-9_-]{8,80}$/.test(documentId||''))throw Error('Document ID required');
  const backupRoot=path.join(projectRoot,'data','backups');
  if(!fs.existsSync(backupRoot))throw Error('No source-audit backup exists');
  const candidates=fs.readdirSync(backupRoot,{withFileTypes:true})
    .filter(x=>x.isDirectory()&&x.name.startsWith('source-audit-'))
    .map(x=>({name:x.name,dir:path.join(backupRoot,x.name)}))
    .filter(x=>fs.existsSync(path.join(x.dir,'backup.json')))
    .sort((a,b)=>b.name.localeCompare(a.name));
  let selected=null;
  for(const candidate of candidates){
    const descriptor=JSON.parse(fs.readFileSync(path.join(candidate.dir,'backup.json'),'utf8'));
    try{
      const originalDir=safeChild(libraryRoot,descriptor.originalFolder);
      const manifestFile=safeChild(originalDir,'archive.json');
      if(!fs.existsSync(manifestFile))continue;
      const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
      if(manifest.documentId!==documentId)continue;
      selected={...candidate,descriptor,manifest,originalDir};
      break;
    }catch(error){
      if(error.code==='ENOENT'||error.message==='UNSAFE_BACKUP_FILE_NAME')continue;
      throw error;
    }
  }
  if(!selected)throw Error('No matching source-audit backup exists');
  if(!Array.isArray(selected.descriptor.files)||selected.descriptor.files.length!==3)
    throw Error('Malformed source-audit backup file list');
  const files=selected.descriptor.files.map(entry=>checkFile({
    originalRoot:selected.originalDir,backupRoot:selected.dir,entry,
  }));
  return {documentId,originalUnchanged:files.every(x=>x.valid),
    archiveStatus:selected.manifest.status,mediaCount:selected.manifest.media?.length||0,
    files,backup:selected.name};
}
async function main(){
  const config=loadConfig();
  const result=verifySourceProtection({
    projectRoot:config.projectRoot,
    libraryRoot:path.resolve(config.archive.libraryRoot),
    documentId:process.argv[2],
  });
  console.log(JSON.stringify(result,null,2));
  if(!result.originalUnchanged)process.exitCode=1;
}
if(require.main===module)main().catch(error=>{
  console.error('SOURCE_PROTECTION_FAILED: '+String(error.message||error));
  process.exitCode=1;
});
module.exports={verifySourceProtection,checkFile};
