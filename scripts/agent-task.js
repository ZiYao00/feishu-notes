'use strict';
// A foreground assistant may poll a long Windows capture without timing out its
// connector command. This does not auto-schedule, retry or remove any files.
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {spawn}=require('child_process');
const {parseDocumentUrl}=require('./agent-capture');
const root=path.resolve(__dirname,'..');
const jobs=path.join(root,'data','state','agent-jobs');
function command(argv) {
  if(['start','start-audit','start-candidate','start-repair'].includes(argv[0])) {
    const audit=argv[0]==='start-audit',candidate=argv[0]==='start-candidate',repair=argv[0]==='start-repair';
    const parsed=parseDocumentUrl(argv[1]);
    if((audit||candidate||repair) ? argv.length!==2 : (argv.length!==3 || argv[2]!=='--confirm-unknown')) throw Error('Expected start-audit/start-candidate <feishu-url> OR start <feishu-url> --confirm-unknown');
    fs.mkdirSync(jobs,{recursive:true});
    const jobId=Date.now()+'-'+crypto.randomUUID().slice(0,8);
    const log=path.join(jobs,jobId+'.log');
    const fd=fs.openSync(log,'wx');
    const jobArgs = audit ? [path.join(__dirname,'audit-source.js'),parsed.url] : candidate ? [path.join(__dirname,'capture-media-candidate.js'),parsed.url] : repair ? [path.join(__dirname,'repair-candidate-blobs.js'),parsed.url] : [path.join(__dirname,'agent-capture.js'),'resume',parsed.url,'--profile','default','--confirm-unknown'];
    const child=spawn(process.execPath,jobArgs,{
      cwd:root,detached:true,stdio:['ignore',fd,fd],windowsHide:true
    });
    fs.closeSync(fd);child.unref();
    const task={jobId,documentId:parsed.documentId,pid:child.pid,startAt:new Date().toISOString(),log:path.basename(log)};
    fs.writeFileSync(path.join(jobs,jobId+'.json'),JSON.stringify(task,null,2));
    return {jobId,pid:child.pid,status:'started'};
  }
  if(argv[0]==='status') {
    const id=argv[1];
    if(!/^[0-9]{13}-[a-f0-9]{8}$/.test(String(id||'')))throw Error('Invalid job ID');
    const task=JSON.parse(fs.readFileSync(path.join(jobs,id+'.json'),'utf8'));
    const log=fs.readFileSync(path.join(jobs,task.log),'utf8');
    const resultLine=log.split(/\r?\n/).reverse().find(x=>x.startsWith('AGENT_CAPTURE_RESULT '));
    const result=resultLine?JSON.parse(resultLine.slice('AGENT_CAPTURE_RESULT '.length)):null;
    const finalEvent=log.split(/\r?\n/).reverse().find(x=>x.includes('"event":"candidate_complete"')||x.includes('"event":"source_audit_complete"')||x.includes('"event":"blob_repair_complete"'));
    let event=null;try{if(finalEvent)event=JSON.parse(finalEvent)}catch{}
    let alive=false;try{process.kill(task.pid,0);alive=true;}catch{}
    const important=log.split(/\r?\n/).filter(x=>/Blocks:|Media:|Archive status:|ERROR|Error:|SCAN_INCOMPLETE|SOURCE_CHANGED|PREFLIGHT|AGENT_CAPTURE_RESULT|RESUME_MEDIA_FAILED|COMPLETE|complete:|candidate_scan|candidate_media_preflight|candidate_complete|source_audit_complete|blob_repair_complete|BLOB_REPAIR_FAILED/.test(x)).map(x=>x.slice(0,460));
    return {jobId:id,alive,status:result?.status||(event?event.event:(alive?'running':'stopped_without_result')),documentId:task.documentId,verified:result?.verification?{valid:result.verification.valid,status:result.verification.status,mediaCount:result.verification.mediaCount,localMediaCount:result.verification.localMediaCount}:null,candidate:event?.event==='candidate_complete'?{status:event.status,mediaStatuses:event.mediaStatuses,attachments:event.attachments,qualityVerified:event.qualityVerified}:null,events:important.slice(-12)};
  }
  throw Error('Usage: node scripts/agent-task.js start <url> --confirm-unknown | status <jobId>');
}
try {console.log(JSON.stringify(command(process.argv.slice(2)),null,2));}
catch(e){console.error(e.message);process.exitCode=1;}
