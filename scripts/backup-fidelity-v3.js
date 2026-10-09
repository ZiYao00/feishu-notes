'use strict';
// Local source-only rollback checkpoint before V3 refactor.
// No git commit, no library/profile mutation and no automatic cleanup.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'..');
const stamp=new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID().slice(0,8);
const base=path.join(root,'data','backups','fidelity-v3-'+stamp);
const names=[
 'AGENTS.md','README.md','config/default.json','docs/ARCHITECTURE.md',
 'docs/PROJECT-HANDBOOK.md','src/archive/archive-writer.js','src/archive/render-document.js',
 'src/cli.js','src/feishu/media-inventory.js','src/feishu/scanner.js','src/viewer/server.js',
 'src/archive/agent-resume.js','src/archive/capture-lock.js','src/archive/source-snapshot.js',
 'src/feishu/attachment-inventory.js',
 'scripts/agent-capture.js','scripts/agent-task.js','scripts/audit-source.js',
 'scripts/build-source-candidate.js','scripts/capture-media-candidate.js',
 'scripts/package-agent-skill.ps1','scripts/preview-source-candidate.js','scripts/repair-candidate-blobs.js',
 'scripts/rerender-source-candidate.js','scripts/verify-agent-capture.js',
 'scripts/verify-agent-resume.js','scripts/verify-candidate-reader.js',
 'scripts/verify-source-fidelity.js','scripts/verify-source-protection.js',
 'skill/feishu-notes/SKILL.md','skill/feishu-notes/agents/openai.yaml',
 'skill/feishu-notes/references/chatgpt-codexpro.md',
 'skill/feishu-notes/references/local-agent.md',
 'skill/feishu-notes/references/validation.md'
];
const check=[];
for(const name of names){
 const src=path.join(root,name);
 if(!fs.existsSync(src)) continue;
 if(!fs.lstatSync(src).isFile())throw Error('Not ordinary file: '+name);
 const dest=path.join(base,'source',name);
 fs.mkdirSync(path.dirname(dest),{recursive:true});
 fs.copyFileSync(src,dest,fs.constants.COPYFILE_EXCL);
 check.push({path:name,sha256:crypto.createHash('sha256').update(fs.readFileSync(src)).digest('hex')});
}
const lib=path.join(root,'library');
const originals=[];
for(const entry of fs.readdirSync(lib,{withFileTypes:true})){
 if(!entry.isDirectory())continue;
 const folder=path.join(lib,entry.name),manifestFile=path.join(folder,'archive.json');
 if(!fs.existsSync(manifestFile))continue;
 const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
 for(const name of ['archive.json',manifest.markdownFile,manifest.htmlFile||'article.html']){
  const p=path.join(folder,name);
  if(!fs.existsSync(p))throw Error('Original archive file missing: '+name);
  const fd=fs.readFileSync(p);
  originals.push({documentId:manifest.documentId,filename:name,sha256:crypto.createHash('sha256').update(fd).digest('hex'),bytes:fd.length});
 }
}
fs.writeFileSync(path.join(base,'baseline.json'),JSON.stringify({stamp,sourceFiles:check,libraryFiles:originals},null,2),{flag:'wx'});
console.log(JSON.stringify({backup:base,sourceFiles:check.length,libraryFiles:originals.length,originalDocuments:new Set(originals.map(x=>x.documentId)).size}));
