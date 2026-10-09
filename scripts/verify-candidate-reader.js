'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const {startViewer}=require('../src/viewer/server');
const {detectChrome}=require('../src/browser/browser-manager');
const {loadConfig}=require('../src/config/load-config');
const {locateCandidate,reportCandidate}=require('./candidate-report');
const sha=buf=>crypto.createHash('sha256').update(buf).digest('hex');
async function main(){
 const doc=process.argv[2],run=process.argv[3]||undefined;
 const {dir,run:runId}=locateCandidate(doc,run),libraryRoot=path.dirname(dir),folder=path.basename(dir);
 const cfg=loadConfig(),manifest=JSON.parse(fs.readFileSync(path.join(dir,'archive.json'),'utf8'));
 const counts={image:0,video:0,unresolved:0};
 for(const item of manifest.media||[]){
  if(item.status==='downloaded')counts[item.kind]=(counts[item.kind]||0)+1;
  else counts.unresolved++;
 }
 const attachments=(manifest.attachments||[]).filter(x=>x.status!=='downloaded').length;
 const srv=await startViewer({libraryRoot,host:'127.0.0.1',port:0});
 let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:detectChrome(),args:['--no-first-run']});
  const results=[];
  for(const [width,height] of [[1920,1080],[390,844]]){
   const page=await browser.newPage({viewport:{width,height}});
   const base='http://127.0.0.1:'+srv.port+'/note/'+encodeURIComponent(folder)+'/';
   const response=await page.goto(base,{waitUntil:'domcontentloaded',timeout:30000});
   await page.waitForTimeout(900);
   const check=await page.evaluate(()=>{
    const headings=[...document.querySelectorAll('article h2, article h3, article h4')];
    const attachments=[...document.querySelectorAll('.reader-attachment-fallback')];
    const images=[...document.querySelectorAll('article img[src]')];
    const videos=[...document.querySelectorAll('article video[src]')];
    return {
     headings:headings.length,attachments:attachments.length,
     images:images.length,videos:videos.length,
     missing:document.querySelectorAll('article .reader-media--unavailable').length,
     onlyNumbers:headings.filter(h=>/^\d+(?:\.\d+)*\.?$/.test(h.textContent.trim())).length,
     remote:[...images,...videos].filter(el=>/^(https?:|blob:)/i.test(el.getAttribute('src')||'')).length,
     horizontalOverflow:document.documentElement.scrollWidth>window.innerWidth+3,
     status:document.querySelector('.reader-status')?.textContent||'unknown',
    };
   });
   assert.equal(response.status(),200,'Reader route must return HTTP 200');
   assert.equal(check.horizontalOverflow,false,'Reader has horizontal overflow');
   assert.equal(check.onlyNumbers,0,'Broken numeric-only heading');
   assert.equal(check.remote,0,'Reader cannot rely on Feishu CDN/blob after conversion');
   assert.equal(check.images,counts.image,'Visible image occurrences differ from manifest');
   assert.equal(check.videos,counts.video,'Visible video occurrences differ from manifest');
   assert.equal(check.missing,counts.unresolved,'Unresolved media occurrences must remain visible');
   assert.equal(check.attachments,attachments,'Unresolved file cards must remain visible');
   const imageChecks=await page.evaluate(async()=>{
    const images=[...document.querySelectorAll('article img[src]')];
    const indexes=[0,Math.floor(images.length/2),images.length-1];
    const out=[];
    for(const i of [...new Set(indexes)]){
     const image=images[i];if(!image)continue;
     image.loading='eager';
     const result=await Promise.race([
      image.decode().then(()=>({ok:image.naturalWidth>0})).catch(e=>({ok:false,error:String(e).slice(0,90)})),
      new Promise(resolve=>setTimeout(()=>resolve({ok:false,error:'decode_timeout'}),6000)),
     ]);
     out.push({index:i,...result});
    }
    return out;
   });
   assert(imageChecks.every(i=>i.ok),'A representative local image cannot be decoded');
   let videoRangeStatus=null;
   if(counts.video){
    const videoUrl=await page.locator('article video[src]').first().evaluate(el=>el.src);
    const range=await fetch(videoUrl,{headers:{Range:'bytes=0-1'},signal:AbortSignal.timeout(12000)});
    videoRangeStatus=range.status;
    await range.body?.cancel().catch(()=>{});
    assert.equal(videoRangeStatus,206,'Local video must support Range 206');
   }
   const screenshot=path.join(cfg.projectRoot,'data','tmp','candidate-reader-'+runId+'-'+width+'.png');
   await page.screenshot({path:screenshot,fullPage:false});
   results.push({width,height,...check,imageChecks,videoRangeStatus,screenshot});
   await page.close();
  }
  const digests={
   manifest:sha(fs.readFileSync(path.join(dir,'archive.json'))),
   html:sha(fs.readFileSync(path.join(dir,manifest.htmlFile||'article.html'))),
   markdown:sha(fs.readFileSync(path.join(dir,manifest.markdownFile))),
  };
  const qaDir=path.join(dir,'.qa');fs.mkdirSync(qaDir,{recursive:true});
  const qa={schema:1,passed:true,checkedAt:new Date().toISOString(),manifestSha:digests.manifest,
   contentDigests:{html:digests.html,markdown:digests.markdown},results};
  const file=path.join(qaDir,'reader-qa-'+Date.now()+'.json');
  fs.writeFileSync(file,JSON.stringify(qa,null,2),{flag:'wx'});
  fs.writeFileSync(path.join(qaDir,'latest.json.next'),JSON.stringify(qa,null,2));
  fs.renameSync(path.join(qaDir,'latest.json.next'),path.join(qaDir,'latest.json'));
  const evaluated=await reportCandidate(doc,runId);
  const reportFile=path.join(dir,'candidate-report.json');
  fs.writeFileSync(reportFile+'.next',JSON.stringify(evaluated.report,null,2),'utf8');
  fs.renameSync(reportFile+'.next',reportFile);
  console.log(JSON.stringify({status:'passed',run:runId,manifestSha:digests.manifest,
    verdict:evaluated.report.verdict,mediaStatuses:evaluated.report.mediaStatuses,results},null,2));
 }finally{await browser?.close().catch(()=>{});await new Promise(resolve=>srv.server.close(resolve))}
}
main().catch(e=>{console.error('CANDIDATE_READER_QA_FAILED '+e.stack);process.exitCode=1});
