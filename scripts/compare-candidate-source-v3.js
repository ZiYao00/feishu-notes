'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {loadConfig}=require('../src/config/load-config');
const {compareSnapshots,sourceMedia,sourceAttachments}=require('../src/archive/source-snapshot');
const {locateCandidate}=require('./candidate-report');
function main(){
 const id=process.argv[2],run=process.argv[3];
 const cfg=loadConfig(),{dir}=locateCandidate(id,run);
 const a=JSON.parse(fs.readFileSync(path.join(dir,'.source','source-blocks.json')));
 const scanRoot=path.join(cfg.projectRoot,'data','tmp','source-audits',id);
 const newest=fs.readdirSync(scanRoot).filter(n=>/^scan-[0-9]+-[a-zA-Z0-9]+\.json$/.test(n)).sort().at(-1);
 const b=JSON.parse(fs.readFileSync(path.join(scanRoot,newest),'utf8'));
 if(a.documentId!==b.documentId||a.documentId!==id)throw Error('Snapshot ID mismatch');
 const anchor=x=>x.recordId?'record:'+x.recordId:'block:'+x.id;
 const before=new Map(a.blocks.map(x=>[anchor(x),x])),after=new Map(b.blocks.map(x=>[anchor(x),x]));
 const mismatchedBlockMedia=[],mismatchedAttachments=[];
 let repeatedImageUrls=0;
 for(const old of a.blocks){
  const fresh=after.get(anchor(old));if(!fresh)continue;
  const first=sourceMedia(old).map(x=>({kind:x.kind,index:x.index,context:x.context}));
  const second=sourceMedia(fresh).map(x=>({kind:x.kind,index:x.index,context:x.context}));
  if(JSON.stringify(first)!==JSON.stringify(second))mismatchedBlockMedia.push(anchor(old));
  const oa=sourceAttachments(old).map(x=>x.name);
  const na=sourceAttachments(fresh).map(x=>x.name);
  if(JSON.stringify(oa)!==JSON.stringify(na))mismatchedAttachments.push(anchor(old));
  const imageUrls=(old.media||[]).filter(m=>m.tag==='img').map(m=>m.url);
  if(new Set(imageUrls).size!==imageUrls.length)repeatedImageUrls++;
 }
 const sourceDiff=compareSnapshots(a,b);
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,'archive.json'),'utf8'));
 const oldLogical=new Set((a.media||[]).map(x=>x.identity));
 const newLogical=new Set((b.media||[]).map(x=>x.identity));
 const stats={
  oldSchema:a.schema,newSchema:b.schema,
  blocksOld:a.blocks.length,blocksNew:b.blocks.length,
  mediaOld:a.media.length,mediaNew:b.media.length,
  sourceScanVerified:b.scan?.verifiedComplete===true,
  missingSourceIdentities:sourceDiff.oldOnly.length,addedSourceIdentities:sourceDiff.newOnly.length,
   stableRecordMatches:a.blocks.filter((x,i)=>x.recordId&&x.recordId===b.blocks[i]?.recordId).length,
  textChanges:sourceDiff.textChanged.length,linkChanges:sourceDiff.linkChanged.length,
  attachmentMetadataChanges:sourceDiff.attachmentChanged.length,
  mediaFingerprintChanges:sourceDiff.mediaChanged.length,
  sourceBlockMediaRelationChanges:mismatchedBlockMedia.length,
  sourceAttachmentNameChanges:mismatchedAttachments.length,
  repeatedImageUrlBlocks:repeatedImageUrls,
  exactOldMediaIdentitiesMatching:newLogical.size?[...oldLogical].filter(x=>newLogical.has(x)).length:0,
  previousMediaIdentities:oldLogical.size,newMediaIdentities:newLogical.size,
  candidateMedia:manifest.media.length,
  candidateDownloaded:manifest.media.filter(x=>x.status==='downloaded').length,
  candidateMissingIdentity:manifest.media.filter(x=>!x.identity).length,
   oldCandidateCanBeAutomaticallyRemapped:false,
  mediaContentCorrespondenceCertified:false,
  notes:'Both source snapshots are private. Stable IDs/counts do not by themselves prove already-downloaded media bytes match the same DOM occurrence.',
 };
 const reportDir=path.join(cfg.projectRoot,'data','tmp','source-audits',id);
 const reportFile=path.join(reportDir,'compare-v3-'+Date.now()+'.json');
 fs.writeFileSync(reportFile,JSON.stringify({documentId:id,run,sourceScan:newest,...stats},null,2),{flag:'wx'});
 console.log(JSON.stringify(stats,null,2));
}
try{main()}catch(e){console.error('SOURCE_COMPARE_V3_FAILED '+e.stack);process.exitCode=1}
