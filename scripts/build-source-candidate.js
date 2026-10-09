'use strict';
// Build a private, isolated archive candidate from an authenticated source snapshot.
// It never writes to library/ or deletes previous snapshots.
const fs=require('fs'),path=require('path');
const {loadConfig}=require('../src/config/load-config');
const {createArchive}=require('../src/archive/archive-writer');
const {summarizeSnapshot}=require('../src/archive/source-snapshot');
const id=process.argv[2];
if(!/^[a-zA-Z0-9_-]{8,80}$/.test(id||''))throw Error('Provide a safe document ID');
async function main(){
  const config=loadConfig();
  const dir=path.join(config.projectRoot,'data','tmp','source-audits',id);
  const files=fs.readdirSync(dir).filter(n=>/^scan-[0-9]+-[0-9a-f]+\.json$/.test(n)).sort();
  const name=files.at(-1);if(!name)throw Error('No source snapshot found');
  const doc=JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
  if(!doc.scan?.verifiedComplete)throw Error('SOURCE_SCAN_INCOMPLETE');
  const media=doc.media.map((m,i)=>({
    ...m,id:m.identity||('source-'+i),url:m.url,
    size:null,contentType:null,status:'pending',localRelativePath:null,
  }));
  media.diagnostics=[];
  const libraryRoot=path.join(config.projectRoot,'data','tmp','archive-candidates',id,name.replace(/\.json$/,''));
  const result=await createArchive({
    document:doc,inventory:media,policy:{
      knownTotal:0,unknownCount:media.length,oversizedCount:0,
      warnings:[{type:'candidate_review',message:'Audit candidate only. Physical resources pending verified transfer.'}],
    },
    context:{},page:{},archiveConfig:config.archive,libraryRoot,agentSafe:true,
  });
  const sourceDir=path.join(result.archiveDir,'.source');
  fs.mkdirSync(sourceDir,{recursive:true});
  fs.copyFileSync(path.join(dir,name),path.join(sourceDir,'source-blocks.json'));
  const audit=result.manifest.quality;
  const report={
    status:result.status,candidateRoot:libraryRoot,folder:path.basename(result.archiveDir),
    source:doc.documentId,scan:doc.scan,media:media.length,
    attachmentCount:audit?.unresolvedAttachmentCount,
    blockCoverage:audit?.blockCoverage?{
      total:audit.blockCoverage.totalBlocks,rendered:audit.blockCoverage.rendered,
      unresolved:audit.blockCoverage.unsupportedVisible,empty:audit.blockCoverage.emptyVerified,
      failed:audit.blockCoverage.failed,
    }:null,
    qualityVerified:audit?.verified||false,
  };
  fs.writeFileSync(path.join(result.archiveDir,'candidate-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({event:'candidate_created',...report}));
}
main().catch(e=>{console.error('CANDIDATE_FAILED '+e.message);process.exitCode=1;});
