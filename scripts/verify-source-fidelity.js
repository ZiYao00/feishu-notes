'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {renderDocument}=require('../src/archive/render-document');
const {inferAttachments}=require('../src/feishu/attachment-inventory');
const {buildMediaInventory}=require('../src/feishu/media-inventory');
const {createArchive}=require('../src/archive/archive-writer');
const {snapshotDocument,compareSnapshots}=require('../src/archive/source-snapshot');
const {extFor}=require('../src/archive/agent-resume');
const root=path.resolve(__dirname,'..','data','tmp','verify-source-fidelity-'+process.pid+'-'+require('crypto').randomUUID().slice(0,8));
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2z9sAAAAASUVORK5CYII=','base64');
let passed=0;
async function test(label,fn){await fn();passed++;console.log('PASS '+label)}
async function main(){
 await test('multiline Feishu heading stays a single semantic heading',async()=>{
  const document={title:'Example',blocks:[{id:'1',className:'docx-heading2-block',text:'1.2\n Example heading',html:''}],scan:{verifiedComplete:true}};
  const result=renderDocument({document,inventory:[]});
  assert(result.markdown.includes('### 1.2 Example heading'));
  assert(result.html.includes('1.2 Example heading</h3>'));
  assert.equal(result.audit.blockResults[0].status,'rendered');
 });
 await test('file cards retain name and unresolved state without hiding source',async()=>{
  const block={id:'5',className:'docx-view-block',text:'example-skill.zip 2.50MB',
   html:'<div class="docx-file-block"><div class="file-name">example-skill.zip</div><div class="file-desc">2.50MB</div></div>',media:[]};
  const [a]=inferAttachments(block);
  assert.equal(a.name,'example-skill.zip');assert(a.sizeBytes>2000000);
  const result=renderDocument({document:{title:'Fixture',scan:{verifiedComplete:true},blocks:[block]},inventory:[]});
  assert(result.markdown.includes('example-skill.zip'));
  assert(result.html.includes('飞书附件未离线保存'));
  assert.equal(result.audit.unsupportedVisible,1);
  assert.equal(result.audit.attachmentCandidates.length,1);
 });
 await test('unsupported file prevents verified archive even with zero images',async()=>{
  const doc={title:'Unresolved',documentId:'UNRESOLVED-FILE',sourceUrl:'https://company.feishu.cn/docx/UNRESOLVED-FILE',scan:{verifiedComplete:true,blockCount:1},
   blocks:[{id:'1',className:'docx-view-block',text:'package.rar 1.00MB',html:'<div class="docx-file-block"><div class="file-name">package.rar</div></div>',media:[]}]};
  const out=await createArchive({document:doc,inventory:[],policy:{warnings:[]},context:{},page:{},archiveConfig:{},libraryRoot:path.join(root,'file'),agentSafe:true});
  assert.equal(out.status,'partial');assert.equal(out.manifest.quality.unresolvedAttachmentCount,1);
 });
 await test('expired Blob remains a manifest candidate and a visible diagnostic',async()=>{
  const document={media:[{identity:'img:block:7:0',url:'blob:https://company.feishu.cn/dead',kind:'image',blockIds:['7'],contexts:['standalone']}]};
  const media=await buildMediaInventory({document,context:{},page:{evaluate:async()=>{throw Error('Blob expired')}}});
  assert.equal(media.length,1);assert.equal(media.diagnostics.length,1);
  assert.equal(media[0].status,'pending');assert(media[0].probeError.includes('expired'));
 });
 await test('media limit 100 is enforceable per candidate, never reports complete',async()=>{
  const src='https://company.feishu.cn/assets/';
  const blocks=[],inventory=[];
  for(let i=0;i<3;i++){
    const url=src+i+'.png';
    blocks.push({id:String(i+1),className:'docx-image-block',text:'',html:'<img src="'+url+'">',media:[{url,tag:'img'}]});
    inventory.push({id:'media-'+i,kind:'image',url,extension:'.png',size:png.length,status:'pending',blockIds:[String(i+1)],contexts:['standalone']});
  }
  let attempts=0;
  const result=await createArchive({document:{title:'Bounded',documentId:'LIMIT-TEST',sourceUrl:'https://company.feishu.cn/docx/LIMIT-TEST',scan:{verifiedComplete:true,blockCount:3},blocks},
    inventory,policy:{warnings:[]},context:{},page:{},archiveConfig:{downloadImages:true,downloadVideos:true},
    libraryRoot:path.join(root,'limit'),agentSafe:true,mediaLimits:{warnSingleFileMB:300,warnTotalMB:1024},maxMediaDownloads:2,
    safeMediaTransport:{streamRemote:async(u,c,p,d)=>{attempts++;fs.writeFileSync(d,png)},streamBlob:async()=>{},extFor}});
  assert.equal(attempts,2);
  assert.equal(result.status,'partial');
  assert.equal(result.manifest.media.filter(m=>m.status==='skipped_by_media_limit').length,1);
 });
 await test('two source snapshots expose changed Block text and media count',async()=>{
  const a=snapshotDocument({documentId:'a',title:'t',scan:{verifiedComplete:true},blocks:[{id:'2',className:'docx-heading2-block',text:'Original',html:'',media:[]}]});
  const b=snapshotDocument({documentId:'a',title:'t',scan:{verifiedComplete:true},blocks:[{id:'2',className:'docx-heading2-block',text:'Changed',html:'',media:[]}]});
  assert.deepEqual(compareSnapshots(a,b).textChanged,['block:2']);
 });
 await test('source fingerprints detect attachment and link changes',async()=>{
  const original={documentId:'SOURCE-V2',title:'t',scan:{verifiedComplete:true},blocks:[
   {id:'5',className:'docx-view-block',text:'File download',
    html:'<div class="docx-file-block"><a href="https://example.com/a">download</a></div>',
    media:[],attachments:[{blockId:'5',name:'package.zip',sizeBytes:1024,status:'unresolved'}]},
  ]};
  const before=snapshotDocument(original);
  const attachment=snapshotDocument({...original,blocks:[{...original.blocks[0],
    attachments:[{blockId:'5',name:'package-v2.zip',sizeBytes:1024,status:'unresolved'}]}]});
  assert.deepEqual(compareSnapshots(before,attachment).attachmentChanged,['block:5']);
  assert.equal(compareSnapshots(before,attachment).sameContent,false);
  const link=snapshotDocument({...original,blocks:[{...original.blocks[0],
    html:original.blocks[0].html.replace('example.com/a','example.com/b')}]});
  assert.deepEqual(compareSnapshots(before,link).linkChanged,['block:5']);
 });
 await test('two images with identical URL retain separate Block ordinals',async()=>{
  const url='https://internal-api-drive-stream.feishu.cn/photo.png';
  const img=[{tag:'img',url,identity:'image:block:8:0'},{tag:'img',url,identity:'image:block:8:1'}];
  const doc={title:'dupe',documentId:'DUPLICATE-IMG',scan:{verifiedComplete:true,blockCount:1},
    blocks:[{id:'8',className:'docx-image-block',text:'',html:'<div><img src="'+url+'"><img src="'+url+'"></div>',media:img}]};
  const media=img.map((m,i)=>({kind:'image',id:'img'+i,identity:m.identity,url,blockIds:['8'],
    status:'downloaded',contentHash:'a'.repeat(64),localRelativePath:'assets/images/unique-'+i+'.png'}));
  const out=renderDocument({document:doc,inventory:media});
  assert(out.markdown.includes('unique-0.png')&&out.markdown.includes('unique-1.png'));
  assert(out.html.includes('unique-0.png')&&out.html.includes('unique-1.png'));
 });
 await test('existing attachment metadata gets enriched with visible file size',async()=>{
  const {inferAttachments}=require('../src/feishu/attachment-inventory');
  const item={id:'a',className:'docx-view-block',text:'download 2.5MB',
   html:'<div class="docx-file-block"><div class="file-name">my.zip</div><div class="file-desc">2.5MB</div></div>',
   attachments:[{blockId:'a',name:'my.zip',status:'unresolved'}],media:[]};
  assert(inferAttachments(item)[0].sizeBytes>2e6);
 });
 await test('ambiguous rich-content URL causes visible failure, never silent image replacement',()=>{
   const url='https://internal-api-drive-stream.feishu.cn/media/reused';
   const doc={title:'Conflict',documentId:'CONFLICT-ID',scan:{verifiedComplete:true,blockCount:1},
     blocks:[{id:'9',className:'docx-text-block',text:'Preserve this source text',
       html:'<div><span>Preserve this source text</span><img src="'+url+'"></div>',media:[]}]};
   const media=[
     {id:'first',url,kind:'image',status:'downloaded',blockIds:['9'],identity:'image:block:9:0',localRelativePath:'assets/images/one.png'},
     {id:'second',url,kind:'image',status:'downloaded',blockIds:['9'],identity:'image:block:9:1',localRelativePath:'assets/images/two.png'},
   ];
   const out=renderDocument({document:doc,inventory:media});
   assert.equal(out.audit.failed,1);
   assert(out.markdown.includes('Preserve this source text'));
   assert(out.html.includes('原文转换待复核'));
   assert(!out.html.includes('assets/images/one.png'));
 });
 await test('stable record ID prevents volatile block ID false source changes',()=>{
   const a={documentId:'RDRIFT',title:'Ref',blocks:[
     {id:'8',recordId:'fixed-record-123',className:'docx-image-block',text:'Caption',
      html:'<div data-record-id="fixed-record-123"><img src="blob:https://company.feishu.cn/blob1"></div>',
      media:[{tag:'img',url:'blob:https://company.feishu.cn/blob1',identity:'image:block:8:0'}]},
   ]};
   const b={...a,blocks:[{...a.blocks[0],id:'902',
     html:a.blocks[0].html.replace('blob1','blob2'),
     media:[{tag:'img',url:'blob:https://company.feishu.cn/blob2',identity:'image:record:fixed-record-123:0'}]}]};
   const before=snapshotDocument(a),after=snapshotDocument(b);
   const diff=compareSnapshots(before,after);
   assert.equal(diff.oldOnly.length,0);
   assert.equal(diff.newOnly.length,0);
   assert.equal(diff.textChanged.length,0);
   assert.equal(diff.mediaChanged.length,0);
   assert.equal(diff.sameContent,true);
   assert.equal(before.contentFingerprint,after.contentFingerprint);
 });
 await test('Blob rehydration accepts exact stable record identity only',async()=>{
   const {rehydrateBlobUrl}=require('../src/archive/agent-resume');
   const known={kind:'image',identity:'image:record:recordStable:1',blockIds:['992'],recordIds:['recordStable']};
   let selector='';
   const fake={locator:s=>{selector=s;return{count:async()=>1,first:()=>({
       scrollIntoViewIfNeeded:async()=>{},evaluate:async(fn,ordinal)=>ordinal===1?'blob:https://company.feishu.cn/safe':'',
     })}},waitForTimeout:async()=>{},evaluate:async()=>{}};
   assert.equal(await rehydrateBlobUrl(fake,known),'blob:https://company.feishu.cn/safe');
   assert(selector.includes('data-record-id="recordStable"'));
   await assert.rejects(rehydrateBlobUrl(fake,{...known,recordIds:['different']}),/AMBIGUOUS/);
   await assert.rejects(rehydrateBlobUrl(fake,{...known,identity:'image:record:recordStable:6'}),/REHYDRATION_FAILED/);
 });
 await test('Feishu media host policy rejects foreign hosts and local addresses',()=>{
   const {assertApprovedMediaUrl}=require('../src/feishu/media-url-policy');
   assert.equal(assertApprovedMediaUrl('https://internal-api-drive-stream.feishu.cn/signed').hostname,'internal-api-drive-stream.feishu.cn');
   for(const link of ['https://attacker.invalid/file','http://feishu.cn/a','https://feishu.cn.evil.test/a','https://127.0.0.1/private','https://localhost/a','https://u:p@feishu.cn/a']){
     assert.throws(()=>assertApprovedMediaUrl(link));
   }
 });
 console.log('PASS '+passed+'/'+passed+' source-fidelity checks; fixture='+root);
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1});
