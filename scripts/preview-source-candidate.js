#!/usr/bin/env node
'use strict';
// Read-only local preview for the newest private candidate.
// Never serves from the formal library or binds to a public network interface.
const fs=require('fs');
const path=require('path');
const {loadConfig}=require('../src/config/load-config');
const {startViewer}=require('../src/viewer/server');
const root=path.join(loadConfig().projectRoot,'data','tmp','archive-candidates');
function choose(){
  if(!fs.existsSync(root))throw Error('No candidate workspace exists');
  const items=[];
  for(const doc of fs.readdirSync(root,{withFileTypes:true})){
    if(!doc.isDirectory())continue;
    const docDir=path.join(root,doc.name);
    for(const run of fs.readdirSync(docDir,{withFileTypes:true})){
      if(!run.isDirectory())continue;
      const runDir=path.join(docDir,run.name);
      const archives=fs.readdirSync(runDir,{withFileTypes:true}).filter(e=>e.isDirectory()&&fs.existsSync(path.join(runDir,e.name,'archive.json')));
      if(archives.length!==1)continue;
      items.push({runDir,run:run.name,folder:archives[0].name,mtime:fs.statSync(runDir).mtimeMs,live:run.name.startsWith('live-')});
    }
  }
  items.sort((a,b)=>Number(b.live)-Number(a.live)||b.mtime-a.mtime);
  if(!items.length)throw Error('No valid candidate archive found');
  return items[0];
}
async function main(){
  const chosen=choose();
  const {server,port}=await startViewer({libraryRoot:chosen.runDir,host:'127.0.0.1',port:4174});
  const url='http://127.0.0.1:'+port+'/note/'+encodeURIComponent(chosen.folder)+'/';
  console.log('CANDIDATE_PREVIEW_URL '+url);
  console.log('CANDIDATE_RUN '+chosen.run);
  console.log('CANDIDATE_ISOLATED: formal library unchanged. Press Ctrl+C to stop preview.');
  const stop=()=>server.close(()=>process.exit(0));
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
main().catch(e=>{console.error('CANDIDATE_PREVIEW_FAILED '+e.message);process.exitCode=1});
