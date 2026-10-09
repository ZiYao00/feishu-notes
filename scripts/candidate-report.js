'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {loadConfig}=require('../src/config/load-config');
const {verifyStoredArchive,summarizeManifest}=require('../src/archive/quality-gate');
const root=path.join(loadConfig().projectRoot,'data','tmp','archive-candidates');
function locateCandidate(documentId,run){
 if(!/^[a-zA-Z0-9_-]{8,80}$/.test(documentId||''))throw Error('Provide the exact Feishu document ID');
 const docRoot=path.join(root,documentId);
 const runs=fs.readdirSync(docRoot,{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>x.name).sort();
 const selected=run||runs.filter(x=>x.startsWith('live-')).at(-1)||runs.at(-1);
 if(!selected||!/^((live|scan)-[0-9]+-[a-zA-Z0-9]+)$/.test(selected))throw Error('Invalid run');
 const base=path.join(docRoot,selected);
 const folders=fs.readdirSync(base,{withFileTypes:true}).filter(x=>x.isDirectory()&&fs.existsSync(path.join(base,x.name,'archive.json')));
 if(folders.length!==1)throw Error('Candidate folder ambiguous');
 return {run:selected,dir:path.join(base,folders[0].name),documentId};
}
async function reportCandidate(documentId,run){
 const c=locateCandidate(documentId,run);
 const raw=fs.readFileSync(path.join(c.dir,'archive.json'));
 const manifest=JSON.parse(raw);
 if(manifest.documentId!==c.documentId)throw Error('Candidate ID mismatch');
 const manifestSha=crypto.createHash('sha256').update(raw).digest('hex');
 let qa=null;
 const qaFile=path.join(c.dir,'.qa','latest.json');
 if(fs.existsSync(qaFile)){
  try{
   const record=JSON.parse(fs.readFileSync(qaFile,'utf8'));
   if(record.passed&&record.manifestSha===manifestSha)qa={passed:true,checkedAt:record.checkedAt,sourceDigest:manifestSha,contentDigests:record.contentDigests};
  }catch{}
 }
 const inspection=await verifyStoredArchive({dir:c.dir,manifest,readerQa:qa});
 const report={...summarizeManifest(manifest,inspection),run:c.run,manifestSha,
  physicalMediaVerified:inspection.physicalMediaCount,
  validLocalFiles:inspection.issues.length===0,
  sourceVerified:inspection.verdict!=='unverified',
  readerQa:qa?.passed||false,issues:inspection.issues,warnings:inspection.warnings,
  eligibleForUserReview:inspection.verdict!=='unverified'&&qa?.passed===true};
 return {candidate:c,report};
}
async function main(){
 const documentId=process.argv[2],run=process.argv[3]||undefined;
 const {report}=await reportCandidate(documentId,run);
 console.log(JSON.stringify(report,null,2));
 if(report.issues.length)process.exitCode=5;
}
if(require.main===module)main().catch(e=>{console.error('CANDIDATE_REPORT_FAILED '+e.message);process.exitCode=1});
module.exports={locateCandidate,reportCandidate};
