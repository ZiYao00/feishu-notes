'use strict';
// Recover only failed image blobs already counted inside the user's approved
// first 100 media occurrences. Never touches library/ or inaccessible file attachments.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {chromium}=require('playwright-core');
const {loadConfig}=require('../src/config/load-config');
const {launchProfile}=require('../src/browser/browser-manager');
const {acquireCaptureLock}=require('../src/archive/capture-lock');
const {streamBlob,extFor,rewriteSaved,backupThree,publishThree,validExisting}=require('../src/archive/agent-resume');
const {storageSummary}=require('../src/archive/archive-writer');
const {parseDocumentUrl}=require('./agent-capture');
const parsed=parseDocumentUrl(process.argv[2]);
const id=parsed.documentId;
function sha(buf){return crypto.createHash('sha256').update(buf).digest('hex')}
async function main(){
 const cfg=loadConfig(),base=path.join(cfg.projectRoot,'data','tmp','archive-candidates',id);
 const runs=fs.readdirSync(base).filter(x=>x.startsWith('live-')).sort();
 const run=runs.at(-1),root=path.join(base,run),folder=fs.readdirSync(root).find(x=>fs.existsSync(path.join(root,x,'archive.json')));
 if(!run||!folder)throw Error('Live candidate unavailable');
 const dir=path.join(root,folder),manifestFile=path.join(dir,'archive.json'),m=JSON.parse(fs.readFileSync(manifestFile));
 if(m.documentId!==id||m.status==='complete')throw Error('Invalid candidate state');
 const targets=m.media.filter(x=>x.kind==='image'&&x.status==='failed'&&String(x.sourceUrl||'').startsWith('blob:'));
 if(targets.length>100)throw Error('Too many targets');
 const unlock=acquireCaptureLock(cfg.projectRoot,id);let browser;
 try{
  const b=await launchProfile({chromePath:cfg.browser.chromePath,profileRoot:cfg.browser.profileRoot,profileName:'default',
    targetUrl:parsed.url,diskCacheMB:cfg.browser.diskCacheMB,mediaCacheMB:cfg.browser.mediaCacheMB});
  browser=await chromium.connectOverCDP(b.cdpEndpoint);
  const context=browser.contexts()[0],page=context.pages().find(p=>p.url().includes(id))||await context.newPage();
  await page.goto(parsed.url,{waitUntil:'domcontentloaded',timeout:45000});await page.waitForTimeout(2000);
  const stageDir=path.join(dir,'assets','images','.staging');fs.mkdirSync(stageDir,{recursive:true});
  const journalFile=path.join(root,'image-repair-journal.json');
  const journal=fs.existsSync(journalFile)?JSON.parse(fs.readFileSync(journalFile)):{startedAt:new Date().toISOString(),documentId:id,assets:{}};
  const success=[],errors=[];
  let used=m.media.filter(x=>x.status==='downloaded').reduce((sum,x)=>sum+(x.actualSize||0),0);
  const budget={singleMax:300*1024**2,totalMax:1024*1024**2};
  for(const item of targets){
    try{
      const existing=journal.assets[item.id];
      if(existing&&await validExisting(dir,existing,'image')){success.push({old:item,entry:existing});continue}
      const stage=path.join(stageDir,'recovered-'+crypto.randomUUID()+'.part');
      await streamBlob(item.sourceUrl,page,stage,used,budget,item);
      const bytes=fs.readFileSync(stage),size=bytes.length,ext=extFor(bytes.subarray(0,256),'image');
      if(!size||!ext)throw Error('INVALID_IMAGE_BYTES');
      const digest=sha(bytes),rel='assets/images/sha256-'+digest+ext,destination=path.join(dir,rel);
      if(fs.existsSync(destination)){if(sha(fs.readFileSync(destination))!==digest)throw Error('CONTENT_HASH_COLLISION');}
      else fs.linkSync(stage,destination);
      const entry={id:item.id,kind:'image',status:'downloaded',localRelativePath:rel,contentHash:digest,actualSize:size};
      journal.assets[item.id]=entry;
      fs.writeFileSync(journalFile+'.next',JSON.stringify(journal,null,2));
      fs.renameSync(journalFile+'.next',journalFile);
      success.push({old:item,entry});
      used+=size;
    }catch(err){errors.push({id:item.id,blockIds:item.blockIds,error:err.message.slice(0,180)})}
  }
  if(success.length){
    const files={html:m.htmlFile||'article.html',markdown:m.markdownFile,manifest:'archive.json'};
    const md=fs.readFileSync(path.join(dir,files.markdown),'utf8'),html=fs.readFileSync(path.join(dir,files.html),'utf8');
    const nextMd=rewriteSaved(md,success),nextHtml=rewriteSaved(html,success,true);
    for(const {old} of success)if(nextMd.includes(old.sourceUrl)||nextHtml.includes(old.sourceUrl))throw Error('FAILED_MEDIA_REFERENCE_REWRITE');
    const nextMedia=m.media.map(old=>{
      const result=success.find(s=>s.old.id===old.id);
      return result?{...old,...result.entry,error:null}:old;
    });
    const nextManifest={...m,status:'partial',media:nextMedia,storage:storageSummary(nextMedia),
      quality:{...m.quality,verified:false},lastRecoveryAt:new Date().toISOString()};
    const backup=backupThree(dir,files,cfg.projectRoot);
    publishThree(dir,files,{markdown:nextMd,html:nextHtml,manifest:JSON.stringify(nextManifest,null,2)},backup);
  }
  console.log(JSON.stringify({event:'blob_repair_complete',candidate:run,attempted:targets.length,recovered:success.length,remaining:errors.length,
    errors:errors.slice(0,8),status:'partial',untouchedMediaLimit:m.media.filter(x=>x.status==='skipped_by_media_limit').length}));
 }finally{await browser?.close().catch(()=>{});unlock()}
}
main().catch(e=>{console.error('BLOB_REPAIR_FAILED '+e.stack);process.exitCode=1});
