'use strict';
// Create a private, explicitly unverified preview from a fresh source snapshot
// and SHA-256-checked assets of an older candidate. The original candidates,
// formal library, Explain, login profiles and downloaded media are immutable.
// Historical image/video bytes are NOT certified against the current source.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {loadConfig}=require('../src/config/load-config');
const {createArchive}=require('../src/archive/archive-writer');
const {safeLocalFile,hashFile,verifyStoredArchive}=require('../src/archive/quality-gate');
const {extFor}=require('../src/archive/agent-resume');
const id=process.argv[2],oldRun=process.argv[3];
if(!/^[a-zA-Z0-9_-]{8,80}$/.test(id||'')||!/^live-[0-9]+-[a-zA-Z0-9]+$/.test(oldRun||''))throw Error('Expected document ID and old live-... candidate run.');
const fileId=raw=>String(raw||'');
function archiveAt(base){
 const folders=fs.readdirSync(base,{withFileTypes:true}).filter(e=>e.isDirectory()&&fs.existsSync(path.join(base,e.name,'archive.json')));
 if(folders.length!==1)throw Error('Candidate archive directory is missing or ambiguous');
 return path.join(base,folders[0].name);
}
function parentRecords(item,ids){
 const raw=[...new Set((item.blockIds||[]).map(v=>ids.get(fileId(v))).filter(Boolean))];
 if(raw.length!==1)throw Error('MEDIA_PARENT_IDENTITY_AMBIGUOUS: source record relation cannot be proved');
 return raw[0];
}
function groupIndex(media,blockIds){
 const map=new Map();
 for(const item of media){
  const key=item.kind+'|'+parentRecords(item,blockIds);
  if(map.has(key))throw Error('MEDIA_PARENT_IDENTITY_AMBIGUOUS: multiple media at the same record without provable occurrence correspondence');
  map.set(key,item);
 }
 return map;
}
async function main(){
 const cfg=loadConfig();
 const base=path.join(cfg.projectRoot,'data','tmp','archive-candidates',id);
 const oldDir=archiveAt(path.join(base,oldRun));
 const oldManifest=JSON.parse(fs.readFileSync(path.join(oldDir,'archive.json'),'utf8'));
 const oldSource=JSON.parse(fs.readFileSync(path.join(oldDir,'.source','source-blocks.json'),'utf8'));
 const sourceRoot=path.join(cfg.projectRoot,'data','tmp','source-audits',id);
 const name=fs.readdirSync(sourceRoot).filter(n=>/^scan-[0-9]+-[a-zA-Z0-9]+\.json$/.test(n)).sort().at(-1);
 if(!name)throw Error('No recent source snapshot');
 const newSourcePath=path.join(sourceRoot,name);
 const doc=JSON.parse(fs.readFileSync(newSourcePath,'utf8'));
 if(doc.documentId!==id||oldManifest.documentId!==id||oldSource.documentId!==id)throw Error('Document identity mismatch');
 if(doc.scan?.verifiedComplete!==true||doc.scan.calloutCoverage?.resolved!==doc.scan.calloutCoverage?.total||
    doc.scan.calloutCoverage?.unresolved?.length)throw Error('NEW_SOURCE_NOT_FULLY_SCANNED');
 const oldIds=new Map(oldSource.blocks.map(b=>[String(b.id),b.recordId||null]));
 const newIds=new Map(doc.blocks.map(b=>[String(b.id),b.recordId||null]));
 const oldIndex=groupIndex(oldManifest.media||[],oldIds);
 const freshIndex=groupIndex(doc.media||[],newIds);
 if(oldIndex.size!==freshIndex.size)throw Error('SOURCE_MEDIA_OCCURRENCE_COUNT_CHANGED');
 if([...oldIndex.keys()].some(key=>!freshIndex.has(key)))throw Error('SOURCE_MEDIA_PARENT_RELATION_CHANGED');
 let downloaded=0,pending=0;
 const files=new Map();
 const inventory=doc.media.map((item,i)=>{
  const key=item.kind+'|'+parentRecords(item,newIds),old=oldIndex.get(key);
  if(!old||old.kind!==item.kind)throw Error('SOURCE_MEDIA_IDENTITY_MISMATCH');
  const dest={...item,id:item.identity||'source-'+i,url:item.url,size:null,
    contentType:old.contentType||null,extension:path.extname(old.localRelativePath||'')||null,
    status:'pending',actualSize:null,contentHash:null,localRelativePath:null};
  if(old.status==='downloaded'){
   if(!/^[a-f0-9]{64}$/i.test(old.contentHash||'')||!Number.isSafeInteger(old.actualSize)||old.actualSize<=0)throw Error('OLD_MEDIA_HASH_OR_SIZE_MISSING');
   const source=safeLocalFile(oldDir,old.localRelativePath);
   const st=fs.statSync(source);
   if(!st.isFile()||st.size!==old.actualSize)throw Error('OLD_MEDIA_SIZE_MISMATCH');
   const oldUrl=String(old.sourceUrl||''),freshUrl=String(item.url||'');
   if(/^https:/i.test(oldUrl)&&/^https:/i.test(freshUrl)){
    const a=new URL(oldUrl),b=new URL(freshUrl);
    if(a.hostname!==b.hostname||a.pathname!==b.pathname)throw Error('OLD_AND_NEW_MEDIA_URL_PATH_DIFFER');
   }
   dest.status='downloaded';dest.localRelativePath=old.localRelativePath;
   dest.actualSize=old.actualSize;dest.contentHash=old.contentHash;downloaded++;
   const previously=files.get(old.localRelativePath);
   if(previously&&previously.contentHash!==old.contentHash)throw Error('MEDIA_ASSET_PATH_HASH_COLLISION');
   files.set(old.localRelativePath,{source,contentHash:old.contentHash,actualSize:old.actualSize,kind:old.kind});
  }else{
   dest.status='skipped_by_media_limit';dest.error='Not downloaded in previously authorized bounded candidate';pending++;
  }
  return dest;
 });
 // Precheck every asset before creating any new candidate.
 for(const f of files.values()){
  const digest=await hashFile(f.source);
  if(digest!==f.contentHash)throw Error('OLD_MEDIA_SHA256_MISMATCH');
  const header=Buffer.alloc(256),fd=fs.openSync(f.source,'r');
  try{fs.readSync(fd,header,0,header.length,0)}finally{fs.closeSync(fd)}
  if(!extFor(header,f.kind))throw Error('OLD_MEDIA_SIGNATURE_INVALID');
 }
 inventory.diagnostics=[];
 const run='live-'+Date.now()+'-'+crypto.randomUUID().replace(/-/g,'').slice(0,8);
 const libraryRoot=path.join(base,run);
 const policy={knownTotal:0,unknownCount:pending,oversizedCount:0,provisionalAssetReuse:true,
  warnings:[{type:'provisional_asset_reuse',message:'Historical assets are SHA-256 verified but have not been byte-compared with current Feishu source.'}]};
 const result=await createArchive({document:doc,inventory,policy,context:{},page:{},
  archiveConfig:cfg.archive,libraryRoot,agentSafe:true});
 let copies=0;
 for(const [relative,f] of files){
  const dst=safeLocalFile(result.archiveDir,relative);
  fs.mkdirSync(path.dirname(dst),{recursive:true});
  fs.copyFileSync(f.source,dst,fs.constants.COPYFILE_EXCL);
  const st=fs.statSync(dst);
  if(st.size!==f.actualSize||await hashFile(dst)!==f.contentHash)throw Error('STAGED_MEDIA_VERIFICATION_FAILED');
  copies++;
 }
 const sourceDir=path.join(result.archiveDir,'.source');
 fs.mkdirSync(sourceDir,{recursive:true});
 fs.copyFileSync(newSourcePath,path.join(sourceDir,'source-blocks.json'),fs.constants.COPYFILE_EXCL);
 const saved=JSON.parse(fs.readFileSync(path.join(result.archiveDir,'archive.json')));
 const physical=await verifyStoredArchive({dir:result.archiveDir,manifest:saved});
 if(physical.physicalMediaCount!==downloaded)throw Error('PHYSICAL_MEDIA_VERIFICATION_FAILED');
 if(physical.verdict!=='unverified'||!physical.issues.includes('historical_media_bytes_unverified'))throw Error('PROVISIONAL_QA_GUARD_FAILED');
 const report={event:'provisional_preview_created',run,
  newSource:name,blocks:doc.blocks.length,callouts:doc.scan.calloutCoverage.total,
  mediaTotal:doc.media.length,reused:downloaded,notDownloaded:pending,copiedAssets:copies,
  unresolvedAttachments:saved.quality.unresolvedAttachmentCount,
  verdict:physical.verdict,reason:'historical_media_bytes_unverified',archiveDir:result.archiveDir};
 fs.writeFileSync(path.join(result.archiveDir,'provisional-review.json'),JSON.stringify(report,null,2),{flag:'wx'});
 console.log(JSON.stringify(report,null,2));
}
main().catch(e=>{console.error('PROVISIONAL_PREVIEW_FAILED '+(e.stack||e));process.exitCode=1});