'use strict';
// Shared, fail-closed publication contract. No automatic deletion of user
// archives or obsolete media. A marker blocks Reader during mixed file states;
// recovery is explicit rather than silently replayed after an interrupted job.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {safeLocalFile}=require('./quality-gate');
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const markerName='.publish-state.json';
function markerPath(dir){return path.join(dir,markerName)}
function atomicJson(file,data){
 const next=file+'.next-'+process.pid;
 fs.writeFileSync(next,JSON.stringify(data,null,2),'utf8');
 fs.renameSync(next,file);
}
function readMarker(dir){
 const file=markerPath(dir);
 return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
}
function assertSafeFiles(dir,files,contents){
 if(files.manifest!=='archive.json')throw Error('PUBLISH_INVALID_MANIFEST_PATH');
 for(const key of ['markdown','html','manifest']){
  if(typeof files[key]!=='string'||typeof contents[key]!=='string')throw Error('PUBLISH_INVALID_INPUT '+key);
  safeLocalFile(dir,files[key]);
 }
 const m=JSON.parse(contents.manifest);
 if(!m.documentId||m.markdownFile!==files.markdown||m.htmlFile!==files.html||
    !['complete','partial','pending_confirmation'].includes(m.status))
   throw Error('PUBLISH_MANIFEST_CONTENT_MISMATCH');
 return m;
}
function preparePublication({dir,files,contents,projectRoot=path.resolve(__dirname,'..','..')}){
 if(readMarker(dir))throw Error('PUBLISH_INTERRUPTED: review existing .publish-state.json first');
 fs.mkdirSync(dir,{recursive:true});
 assertSafeFiles(dir,files,contents);
 const txid=Date.now()+'-'+crypto.randomUUID().slice(0,8);
 const backupRoot=path.join(projectRoot,'data','backups','publish-tx-'+txid);
 fs.mkdirSync(backupRoot,{recursive:true});
 const entries=[];
 for(const key of ['html','markdown','manifest']){
  const dest=safeLocalFile(dir,files[key]);
  const old=fs.existsSync(dest)?fs.readFileSync(dest):null;
  const next=Buffer.from(contents[key],'utf8');
  const backupName=key+'.old';
  if(old!==null)fs.writeFileSync(path.join(backupRoot,backupName),old,{flag:'wx'});
  const stage=dest+'.stage-'+txid;
  fs.writeFileSync(stage,next,{flag:'wx'});
  entries.push({key,relative:files[key],hadOriginal:old!==null,
    backupName:old===null?null:backupName,oldSha:old===null?null:sha(old),
    newSha:sha(next),stageRelative:path.relative(dir,stage)});
 }
 const journal={version:1,txid,documentDir:dir,createdAt:new Date().toISOString(),
   phase:'prepared',backupRoot,entries,published:[]};
 atomicJson(path.join(backupRoot,'journal.json'),journal);
 atomicJson(markerPath(dir),journal);
 return journal;
}
function publishArchiveFiles({dir,files,contents,projectRoot,failureAfter=null}){
 const journal=preparePublication({dir,files,contents,projectRoot});
 const marker=markerPath(dir);
 try {
  // Optimistic concurrency: never overwrite files modified while preparing.
  for(const e of journal.entries){
   const dest=safeLocalFile(dir,e.relative);
   const current=fs.existsSync(dest)?sha(fs.readFileSync(dest)):null;
   if(current!==e.oldSha)throw Error('PUBLISH_CONCURRENT_CHANGE');
  }
  for(const e of journal.entries){
   const dest=safeLocalFile(dir,e.relative);
   fs.renameSync(safeLocalFile(dir,e.stageRelative),dest);
   journal.published.push(e.key);
   journal.phase='published-'+e.key;
   atomicJson(marker,journal);
   if(failureAfter===e.key)throw Error('PUBLISH_SIMULATED_INTERRUPT_'+e.key);
  }
  for(const e of journal.entries){
   if(sha(fs.readFileSync(safeLocalFile(dir,e.relative)))!==e.newSha)throw Error('PUBLISH_POSTWRITE_HASH_MISMATCH_'+e.key);
  }
  journal.phase='verified';
  atomicJson(path.join(journal.backupRoot,'journal.json'),journal);
  fs.unlinkSync(marker); // remove only the transaction-owned Reader gate after verified success
  return {backupDir:journal.backupRoot,txid:journal.txid,published:true};
 }catch(error){
  // The marker must remain until explicit, externally reviewed recovery.
  journal.phase='requires_recovery';
  journal.error=String(error.message);
  atomicJson(marker,journal);
  atomicJson(path.join(journal.backupRoot,'journal.json'),journal);
  throw error;
 }
}
function inspectPublication(dir){
 const journal=readMarker(dir);
 if(!journal)return {blocked:false};
 const entries=[];
 for(const e of journal.entries||[]){
  const file=safeLocalFile(dir,e.relative);
  let shaNow=null;
  try{if(fs.existsSync(file))shaNow=sha(fs.readFileSync(file))}catch{}
  entries.push({key:e.key,oldMatch:shaNow===e.oldSha,newMatch:shaNow===e.newSha,
    hasStaging:fs.existsSync(safeLocalFile(dir,e.stageRelative))});
 }
 return {blocked:true,txid:journal.txid,phase:journal.phase,backupRoot:journal.backupRoot,entries};
}
function recoverPublication({dir,decision}){
 if(decision!=='restore')throw Error('PUBLISH_RECOVERY_REQUIRES_EXPLICIT_RESTORE');
 const journal=readMarker(dir);
 if(!journal)throw Error('PUBLISH_NO_INTERRUPTED_TRANSACTION');
 const status=inspectPublication(dir);
 if(status.entries.some(x=>!x.oldMatch&&!x.newMatch))throw Error('PUBLISH_EXTERNAL_CHANGE: manual review needed');
 for(const e of journal.entries){
  const dest=safeLocalFile(dir,e.relative);
  if(e.hadOriginal){
   const backup=path.join(journal.backupRoot,e.backupName);
   if(sha(fs.readFileSync(backup))!==e.oldSha)throw Error('PUBLISH_BACKUP_CORRUPTED');
   const temp=dest+'.restore-'+journal.txid;
   fs.copyFileSync(backup,temp);
   fs.renameSync(temp,dest);
  }else if(fs.existsSync(dest)&&sha(fs.readFileSync(dest))===e.newSha){
   // Move a transaction-created file into the private backup, not deletion.
   fs.renameSync(dest,path.join(journal.backupRoot,e.key+'.aborted'));
  }
 }
 journal.phase='restored';
 atomicJson(path.join(journal.backupRoot,'journal.json'),journal);
 fs.unlinkSync(markerPath(dir)); // marker belongs exclusively to this transaction
 return {restored:true,backupDir:journal.backupRoot};
}
module.exports={markerPath,readMarker,preparePublication,publishArchiveFiles,inspectPublication,recoverPublication};
