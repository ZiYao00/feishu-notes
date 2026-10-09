'use strict';
// Offline fixture: the Viewer must not discard pending media while building
// structured case studies. Uses no external Feishu data, download or credentials.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const {detectChrome}=require('../src/browser/browser-manager');
const {renderDocument}=require('../src/archive/render-document');
const {startViewer}=require('../src/viewer/server');
const root=path.resolve(__dirname,'..','data','tmp','pending-reader-regression-'+process.pid+'-'+crypto.randomUUID().slice(0,8));
const folder='pending-media-cases',dir=path.join(root,folder);
async function main(){
 fs.mkdirSync(dir,{recursive:true});
 const blocks=[{id:'root-heading',className:'docx-heading2-block',text:'素材案例',html:'',media:[]}],inventory=[];
 for(let i=0;i<3;i++){
  const key='fixture-image-'+i,url='https://files.feishu.cn/fixtures/'+key+'.png',id='image:record:'+key+':0';
  blocks.push({id:'case-'+i,className:'docx-heading3-block',text:'案例 '+(i+1),html:'',media:[]});
  blocks.push({id:'text-a-'+i,className:'docx-text-block',text:'素材：内容',html:'<div>素材：内容</div>',media:[]});
  blocks.push({id:'text-b-'+i,className:'docx-text-block',text:'特点：保留占位',html:'<div>特点：保留占位</div>',media:[]});
  blocks.push({id:'image-'+i,recordId:key,className:'docx-image-block',text:'',
    html:'<div class="docx-image-block"><img src="'+url+'"></div>',
    media:[{tag:'img',url,identity:id,ownerRecordId:key,context:'standalone'}]});
  inventory.push({id,identity:id,url,kind:'image',status:'pending',blockIds:['image-'+i],
    recordIds:[key],contexts:['standalone'],width:1280,height:720});
 }
 const document={documentId:'PENDING-READER-FIXTURE',title:'Pending Media Cases',blocks};
 const rendered=renderDocument({document,inventory});
 assert.equal((rendered.html.match(/reader-media--unavailable/g)||[]).length,3);
 assert.equal((rendered.html.match(/<figure class="reader-media reader-media--unavailable reader-media--standalone"/g)||[]).length,3);
 fs.writeFileSync(path.join(dir,'article.html'),rendered.html,'utf8');
 fs.writeFileSync(path.join(dir,'fixture.md'),rendered.markdown,'utf8');
 fs.writeFileSync(path.join(dir,'archive.json'),JSON.stringify({documentId:document.documentId,title:document.title,
   status:'partial',htmlFile:'article.html',markdownFile:'fixture.md',media:inventory,scan:{blockCount:blocks.length}},null,2));
 const server=await startViewer({libraryRoot:root,host:'127.0.0.1',port:0});
 let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:detectChrome(),args:['--no-first-run']});
  for(const width of [1920,390]){
   const page=await browser.newPage({viewport:{width,height:844}});
   await page.goto('http://127.0.0.1:'+server.port+'/note/'+folder+'/',{waitUntil:'domcontentloaded'});
   await page.waitForTimeout(650);
   const actual=await page.evaluate(()=>({
    pending:document.querySelectorAll('article .reader-media--unavailable').length,
    caseStudies:document.querySelectorAll('article .reader-case-study').length,
    ids:[...document.querySelectorAll('article [data-media-id]')].map(el=>el.getAttribute('data-media-id')),
    remote:document.querySelectorAll('article img[src^="https:"], article video[src^="https:"]').length,
   }));
   assert.equal(actual.caseStudies,3,'Fixture must activate case restructuring');
   assert.equal(actual.pending,3,'Pending occurrences must survive case restructuring');
   assert.equal(new Set(actual.ids).size,3,'All pending media identities must remain distinct');
   assert.equal(actual.remote,0,'Pending sources must not depend on network');
   console.log('PASS pending case media preserved '+width+'px: 3/3');
   await page.close();
  }
 }finally{await browser?.close().catch(()=>{});await new Promise(resolve=>server.server.close(resolve))}
 console.log('PASS pending media Reader regression; fixture='+root);
}
main().catch(err=>{console.error('PENDING_MEDIA_READER_REGRESSION_FAILED '+(err.stack||err));process.exitCode=1});