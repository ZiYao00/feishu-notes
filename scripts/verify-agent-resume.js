'use strict';
const assert=require('assert').strict;
const fs=require('fs');
const path=require('path');
const {renderDocument}=require('../src/archive/render-document');
const {evaluateMediaPolicy}=require('../src/feishu/media-inventory');
const {acquireCaptureLock}=require('../src/archive/capture-lock');
const {resumeArchive,compareOriginal,pairMedia,extFor}=require('../src/archive/agent-resume');
const {parseOptions}=require('./agent-capture');
const root=path.resolve(__dirname,'..','data','tmp','agent-resume-verify-'+process.pid+'-'+require('crypto').randomUUID().slice(0,8));
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2z9sAAAAASUVORK5CYII=','base64');
let passed=0;
function test(name,fn){return Promise.resolve().then(fn).then(()=>{passed++;console.log('PASS '+name);});}
function makeFixture(label,n=2) {
  const libraryRoot=path.join(root,'library-'+label),dir=path.join(libraryRoot,label),id='FIXTURE-'+label;
  fs.mkdirSync(dir,{recursive:true});
  const old=[],blocks=[{id:'1',className:'docx-heading1-block',text:'Fixed original heading',html:'',media:[]}];
  for(let i=0;i<n;i++) {
    const url='https://example.feishu.cn/media/original'+i+'.png?signature=old';
    const mediaId='media-'+i;old.push({id:mediaId,kind:'image',sourceUrl:url,localRelativePath:'assets/images/'+mediaId+'.png',expectedSize:null,actualSize:null,contentType:'image/png',status:'pending',error:null,blockIds:[String(i+2)],contexts:['standalone']});
    blocks.push({id:String(i+2),className:'docx-image-block',text:'',html:'<img src="'+url+'">',media:[{tag:'img',url}]});
  }
  const document={documentId:id,title:'Fixture '+label,blocks,media:[],scan:{scans:9,blockCount:blocks.length,passes:2,reachedTailPasses:2,verifiedComplete:true,stopReason:'stable_tail'}};
  const initialInventory=old.map(x=>({id:x.id,kind:x.kind,url:x.sourceUrl,blockIds:x.blockIds,contexts:x.contexts,status:'pending'}));
  const rendered=renderDocument({document,inventory:initialInventory});
  const markdownFile='original.md';
  fs.writeFileSync(path.join(dir,markdownFile),rendered.markdown);
  fs.writeFileSync(path.join(dir,'article.html'),rendered.html);
  const manifest={version:2,documentId:id,title:document.title,sourceUrl:'https://example.feishu.cn/docx/'+id,savedAt:'test-fixture',status:'pending_confirmation',markdownFile,htmlFile:'article.html',scan:{scans:400,blockCount:blocks.length},policy:{warnings:[{type:'unknown_size'}]},embeddedSheets:[],storage:{},media:old};
  fs.writeFileSync(path.join(dir,'archive.json'),JSON.stringify(manifest,null,2));
  const fresh=JSON.parse(JSON.stringify(document));
  const inventory=old.map((x,i)=>{
    const url='https://example.feishu.cn/media/updated'+i+'.png?signature=new';
    fresh.blocks[i+1].html='<img src="'+url+'">';
    fresh.blocks[i+1].media[0].url=url;
    return {id:x.id,kind:x.kind,url,blockIds:x.blockIds,contexts:x.contexts,size:null,status:'pending'};
  });
  const saved=fs.readFileSync(path.join(dir,'article.html'),'utf8');
  const newer=renderDocument({document:fresh,inventory}).html;
  return {id,libraryRoot,dir,document:fresh,inventory,manifest,old,saved,newer};
}
function options(fixture,downloadOverride) {
  return {document:fixture.document,inventory:fixture.inventory,context:{},page:{},libraryRoot:fixture.libraryRoot,
    archiveConfig:{downloadImages:true,downloadVideos:true},limits:{warnSingleFileMB:300,warnTotalMB:1024},
    policy:evaluateMediaPolicy(fixture.inventory,{warnFileCount:100,warnUnknownSize:true}),
    confirmUnknown:true,projectRoot:path.join(root,'runtime-'+fixture.id),downloadOverride};
}
async function main(){
  await test('count threshold 40, 89, 100, 101',()=>{
    for(const [n,warning] of [[40,false],[89,false],[100,false],[101,true]]) {
      const inventory=Array.from({length:n},()=>({size:1}));
      const out=evaluateMediaPolicy(inventory,{warnFileCount:100,warnUnknownSize:false});
      assert.equal(out.warnings.some(w=>w.type==='file_count'),warning);
    }
  });
  await test('safe resume flags',()=>{
    const url='https://company.feishu.cn/docx/AbCd';
    assert.equal(parseOptions(['resume',url,'--confirm-unknown']).confirmUnknown,true);
    assert.throws(()=>parseOptions(['inspect',url,'--confirm-unknown']));
    assert.equal(extFor(png,'image'),'.png');
    assert.equal(extFor(Buffer.from('<html>login</html>'),'image'),null);
  });
  await test('source text/IDs stable across changed URLs',()=>{
    const f=makeFixture('stable');
    assert.equal(compareOriginal(f.saved,f.newer).match,true);
    const altered=f.newer.replace('Fixed original heading','Changed original heading');
    assert.equal(compareOriginal(f.saved,altered).match,false);
    assert.equal(pairMedia(f.manifest.media,f.inventory).length,2);
  });
  await test('source equality ignores media placeholder/localization only',()=>{
    const doc={title:'Demo',documentId:'SOURCE-ONLY',scan:{verifiedComplete:true},blocks:[
      {id:'1',className:'docx-heading2-block',text:'Stable heading',html:''},
      {id:'2',className:'docx-image-block',text:'',html:'<img src="https://company.feishu.cn/image.png">',media:[{tag:'img',url:'https://company.feishu.cn/image.png'}]},
    ]};
    const pending=[{id:'image-1',kind:'image',status:'pending',url:'https://company.feishu.cn/image.png',blockIds:['2'],contexts:['standalone']}];
    const downloaded=[{...pending[0],status:'downloaded',localRelativePath:'assets/images/sha256-abc.png'}];
    const a=renderDocument({document:doc,inventory:pending}).html;
    const b=renderDocument({document:doc,inventory:downloaded}).html;
    assert.equal(compareOriginal(a,b).match,true,'media state is not source prose');
    const changed={...doc,blocks:[{...doc.blocks[0],text:'Changed heading'},doc.blocks[1]]};
    assert.equal(compareOriginal(a,renderDocument({document:changed,inventory:pending}).html).match,false);
  });
  await test('stable record identities survive transient block IDs without unsafe media remapping',()=>{
    const oldDoc={title:'Record stable',documentId:'RECORD-STABLE',scan:{verifiedComplete:true},blocks:[
      {id:'41',recordId:'stable-record',className:'docx-text-block',text:'Same source text',html:'<div>Same source text</div>',media:[]}]};
    const newDoc={...oldDoc,blocks:[{...oldDoc.blocks[0],id:'9001'}]};
    const saved=renderDocument({document:oldDoc,inventory:[]}).html;
    const refreshed=renderDocument({document:newDoc,inventory:[]}).html;
    assert.equal(compareOriginal(saved,refreshed).match,true);
    const oldMedia=[{id:'old',kind:'image',identity:'image:record:stable-record:0',blockIds:['41']}];
    const newMedia=[{id:'new',kind:'image',identity:'image:record:stable-record:0',blockIds:['9001']}];
    assert.equal(pairMedia(oldMedia,newMedia)[0].item.id,'new');
    assert.throws(()=>pairMedia(oldMedia,[{...newMedia[0],identity:'image:record:different:0'}]),/SOURCE_MEDIA_CHANGED/);
  });
  await test('common capture lock excludes independent commands',()=>{
    const location=path.join(root,'lock-fixture');const unlock=acquireCaptureLock(location,'doc');
    try{assert.throws(()=>acquireCaptureLock(location,'doc'),/CAPTURE_LOCKED/);}finally{unlock();}
  });
  await test('scanner completeness changes archive state rather than misreporting complete',()=>{
    const {archiveStatus}=require('../src/archive/archive-writer');
    assert.equal(archiveStatus([],false,false),'partial');
    assert.equal(archiveStatus([],false,true),'complete');
  });
  await test('new Agent-safe capture uses byte-limited verified streaming',async()=>{
    const {createArchive}=require('../src/archive/archive-writer');
    const libraryRoot=path.join(root,'fresh-safe-library');
    const mediaUrl='https://example.feishu.cn/media/fixture.png';
    const document={documentId:'NEW-SAFE-TEST',title:'New agent safe',sourceUrl:'https://example.feishu.cn/docx/NEW-SAFE-TEST',
      blocks:[{id:'1',className:'docx-image-block',text:'',html:'<img src="'+mediaUrl+'">',media:[{tag:'img',url:mediaUrl}]}],
      scan:{blockCount:1,verifiedComplete:true,stopReason:'stable_tail'}};
    const inventory=[{id:'new-image',url:mediaUrl,kind:'image',extension:'.png',size:png.length,blockIds:['1'],contexts:['standalone'],status:'pending'}];
    let streamingCalled=0;
    const safeMediaTransport={
      streamRemote:async(_url,_context,_page,dest)=>{streamingCalled++;fs.writeFileSync(dest,png);},
      streamBlob:async()=>{throw Error('blob path should not run');},
      extFor,
    };
    const out=await createArchive({document,inventory,policy:{warnings:[]},context:{},page:{},archiveConfig:{downloadImages:true,downloadVideos:true},
      libraryRoot,agentSafe:true,mediaLimits:{warnSingleFileMB:300,warnTotalMB:1024},safeMediaTransport});
    assert.equal(out.status,'complete');assert.equal(streamingCalled,1);
    const manifest=JSON.parse(fs.readFileSync(path.join(out.archiveDir,'archive.json'),'utf8'));
    assert(manifest.media[0].localRelativePath.startsWith('assets/images/sha256-'));
    assert.equal(manifest.media[0].contentHash.length,64);
  });
  await test('new Agent-safe capture rejects unexpected HTML masquerading as image',async()=>{
    const {createArchive}=require('../src/archive/archive-writer');
    const libraryRoot=path.join(root,'bad-media-library');
    const url='https://example.feishu.cn/media/bad.png';
    const document={documentId:'INVALID-IMAGE',title:'Bad image',blocks:[{id:'1',className:'docx-image-block',text:'',html:'<img src="'+url+'">',media:[{tag:'img',url}]}],
      scan:{blockCount:1,verifiedComplete:true,stopReason:'stable_tail'}};
    const inventory=[{id:'bad',url,kind:'image',extension:'.png',size:25,blockIds:['1'],contexts:['standalone'],status:'pending'}];
    const out=await createArchive({document,inventory,policy:{warnings:[]},context:{},page:{},archiveConfig:{downloadImages:true,downloadVideos:true},
      libraryRoot,agentSafe:true,mediaLimits:{warnSingleFileMB:300,warnTotalMB:1024},
      safeMediaTransport:{streamRemote:async(_a,_b,_c,d)=>fs.writeFileSync(d,'<html>invalid media</html>'),streamBlob:async()=>{},extFor}});
    assert.equal(out.status,'partial');
    assert.equal(out.manifest.media[0].status,'failed');
  });
  await test('safe resume creates backup, localizes media, publishes manifest last',async()=>{
    const f=makeFixture('completed');
    let downloads=0;const cb=async ({stage})=>{downloads++;fs.writeFileSync(stage,png);};
    const out=await resumeArchive(options(f,cb));
    assert.equal(out.status,'complete');assert.equal(downloads,2);
    const m=JSON.parse(fs.readFileSync(path.join(f.dir,'archive.json')));
    assert.equal(m.status,'complete');assert.equal(m.media.length,2);
    assert(m.media.every(x=>x.status==='downloaded'&&x.contentHash));
    assert(!fs.readFileSync(path.join(f.dir,'article.html'),'utf8').includes('signature=old'));
    assert(fs.readFileSync(path.join(f.dir,'original.md'),'utf8').includes('assets/images/sha256-'));
    assert(fs.existsSync(path.join(out.backupDir,'journal.json')));
  });
  await test('interrupted second media retains first progress; retry skips good first media',async()=>{
    const f=makeFixture('interrupted');
    let called=0;
    await assert.rejects(resumeArchive(options(f,async({stage})=>{called++;if(called===2)throw Error('simulated disconnection');fs.writeFileSync(stage,png);})),/RESUME_MEDIA_FAILED/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.dir,'archive.json'))).status,'pending_confirmation');
    let continued=0;
    const out=await resumeArchive(options(f,async({stage})=>{continued++;fs.writeFileSync(stage,png);}));
    assert.equal(continued,1,'first verified asset must be reused');
    assert.equal(out.status,'complete');
  });
  await test('different original text rejects resume without modifying canonical files',async()=>{
    const f=makeFixture('changed');
    f.document.blocks[0].text='Important changed source heading';
    const before=fs.readFileSync(path.join(f.dir,'archive.json'),'utf8');
    await assert.rejects(resumeArchive(options(f,async()=>{throw Error('not reached');})),/SOURCE_CHANGED/);
    assert.equal(fs.readFileSync(path.join(f.dir,'archive.json'),'utf8'),before);
  });
  console.log('PASS '+passed+'/'+passed+' safe agent resume checks; fixture='+root);
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
