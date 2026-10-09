'use strict';
// Re-render an isolated source candidate after improvements to the generic
// renderer without re-scanning or re-downloading protected content.
const fs=require('fs'),path=require('path');
const {loadConfig}=require('../src/config/load-config');
const {renderDocument}=require('../src/archive/render-document');
const {evaluateQuality}=require('../src/archive/quality-gate');
const {backupThree,publishThree}=require('../src/archive/agent-resume');
function safeId(value){if(!/^[a-zA-Z0-9_-]{8,80}$/.test(value||''))throw Error('Document ID required');return value}
function main(){
 const c=loadConfig(),id=safeId(process.argv[2]),root=path.join(c.projectRoot,'data','tmp','archive-candidates',id);
 const run=process.argv[3]||fs.readdirSync(root).filter(x=>x.startsWith('live-')).sort().at(-1);
 if(!/^((?:live|scan)-[0-9]+-[a-zA-Z0-9]+)$/.test(run||''))throw Error('Unsafe candidate run');
 const libraryRoot=path.join(root,run),folder=fs.readdirSync(libraryRoot).find(x=>fs.existsSync(path.join(libraryRoot,x,'archive.json')));
 if(!folder)throw Error('Candidate manifest not found');
 const dir=path.join(libraryRoot,folder),m=JSON.parse(fs.readFileSync(path.join(dir,'archive.json')));
 const source=JSON.parse(fs.readFileSync(path.join(dir,'.source','source-blocks.json')));
 if(m.documentId!==id||source.documentId!==id||m.status==='complete')throw Error('Candidate identity/state mismatch');
 const inventory=m.media.map(x=>({...x,url:x.sourceUrl}));
 const rendered=renderDocument({document:source,inventory});
 const diagnostics=(m.mediaDiagnostics||[]).map(d=>{
   const item=m.media.find(x=>x.sourceUrl===d.url);
   return {...d,resolved:item?.status==='downloaded'};
 });
 const quality=evaluateQuality({document:source,inventory,policy:m.policy,
   audit:rendered.audit,diagnostics});
 const next={...m,quality,attachments:rendered.audit.attachmentCandidates,mediaDiagnostics:diagnostics,
   status:quality.status,lastRenderedAt:new Date().toISOString()};
 const files={html:m.htmlFile||'article.html',markdown:m.markdownFile,manifest:'archive.json'};
 const backup=backupThree(dir,files,c.projectRoot);
 publishThree(dir,files,{html:rendered.html,markdown:rendered.markdown,manifest:JSON.stringify(next,null,2)},backup);
 console.log(JSON.stringify({status:'rerendered',run,blockCoverage:{total:rendered.audit.totalBlocks,rendered:rendered.audit.rendered,unresolved:rendered.audit.unsupportedVisible,failed:rendered.audit.failed},
   attachmentCount:next.attachments.length,mediaDiagnosticsRemaining:quality.mediaDiscoveryErrors,
   mediaDownloaded:m.media.filter(x=>x.status==='downloaded').length,qualityVerified:quality.verified,archiveStatus:next.status}));
}
try{main()}catch(e){console.error('RERENDER_CANDIDATE_FAILED '+e.stack);process.exitCode=1}
