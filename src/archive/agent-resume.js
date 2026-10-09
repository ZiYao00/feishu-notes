'use strict';
// Agent-only resumable media completion. Never alter the original source text,
// abandon original files, remove media, or silently re-capture changed sources.
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {Readable,Transform}=require('stream');
const {pipeline}=require('stream/promises');
const {renderDocument}=require('./render-document');
const {storageSummary}=require('./archive-writer');
const {evaluateQuality}=require('./quality-gate');
const {snapshotDocument}=require('./source-snapshot');
const {assertApprovedMediaUrl}=require('../feishu/media-url-policy');
const {publishArchiveFiles}=require('./publish-transaction');

const MiB=1024*1024;
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const readJson=p=>JSON.parse(fs.readFileSync(p,'utf8'));
function inside(root,relative) {
  if (typeof relative!=='string' || !relative.trim() || path.isAbsolute(relative)) throw new Error('Unsafe archive path');
  const dest=path.resolve(root,relative),r=path.relative(root,dest);
  if(!r || r==='..' || r.startsWith('..'+path.sep) || path.isAbsolute(r)) throw new Error('Archive path escapes root');
  const parts=r.split(path.sep),last=parts.pop(); let step=path.resolve(root);
  for(const part of parts) {
    step=path.join(step,part);
    if(fs.existsSync(step) && fs.lstatSync(step).isSymbolicLink()) throw new Error('Unsafe symlink parent');
  }
  if(fs.existsSync(dest) && fs.lstatSync(dest).isSymbolicLink()) throw new Error('Unsafe symlink file');
  return dest;
}
async function shaFile(file) {
  const h=crypto.createHash('sha256');
  for await(const chunk of fs.createReadStream(file)) h.update(chunk);
  return h.digest('hex');
}
function normalizeReader(html) {
  const article=String(html).match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if(!article) throw new Error('Missing original reader article');
  const body=article[1];
  const ids=[...body.matchAll(/<section\b([^>]*)>/gi)].map(m=>{
    const record=m[1].match(/\bdata-record-id="([^"]+)"/);
    const block=m[1].match(/\bdata-block-id="([^"]+)"/);
    return record?'record:'+record[1]:'block:'+(block?.[1]||'missing');
  });
  // Media download state (local image/video vs an explicit missing-media
  // placeholder) is not a source prose change. Compare everything else.
  const prose=body.replace(/<figure\b[^>]*class="[^"]*\breader-media\b[^"]*"[^>]*>[\s\S]*?<\/figure>/gi,'');
  const text=prose.replace(/<script\b[\s\S]*?<\/script>/gi,'')
    .replace(/<style\b[\s\S]*?<\/style>/gi,'')
    .replace(/<[^>]*>/g,'').replace(/&(?:nbsp|#160);/gi,' ')
    .replace(/\s+/g,' ').trim();
  return {ids,textHash:hash(text),text};
}
function compareOriginal(oldHtml,freshHtml) {
  const before=normalizeReader(oldHtml),after=normalizeReader(freshHtml);
  const firstIdMismatch=before.ids.findIndex((id,i)=>id!==after.ids[i]);
  const beforeSet=new Set(before.ids),afterSet=new Set(after.ids);
  let textFirstDiff=0;
  while(textFirstDiff<Math.min(before.text.length,after.text.length) && before.text[textFirstDiff]===after.text[textFirstDiff])textFirstDiff++;
  return {
    match:before.textHash===after.textHash && JSON.stringify(before.ids)===JSON.stringify(after.ids),
    oldBlocks:before.ids.length,newBlocks:after.ids.length,
    textUnchanged:before.textHash===after.textHash,
    blockIdsUnchanged:JSON.stringify(before.ids)===JSON.stringify(after.ids),
    oldTextLength:before.text.length,newTextLength:after.text.length,
    firstTextDifferenceOffset:textFirstDiff,
    firstBlockIdDifferenceIndex:firstIdMismatch,
    oldOnlyBlockCount:before.ids.filter(id=>!afterSet.has(id)).length,
    newOnlyBlockCount:after.ids.filter(id=>!beforeSet.has(id)).length,
  };
}
function locateArchive(root,id) {
  let result=null;
  for(const entry of fs.readdirSync(root,{withFileTypes:true})) {
    if(!entry.isDirectory()) continue;
    const candidate=path.join(root,entry.name),f=path.join(candidate,'archive.json');
    if(!fs.existsSync(f)) continue;
    if(!fs.lstatSync(f).isFile()) throw new Error('Unsafe existing manifest');
    let manifest;
    try{manifest=readJson(f);}catch{throw new Error('Unreadable manifest; stop to protect the library');}
    if(manifest.documentId===id) {
      if(result) throw new Error('Duplicate document IDs in library; require manual review.');
      result={dir:candidate,manifest,manifestFile:f};
    }
  }
  return result;
}
function blockKey(v) {
  return [v.kind,(v.blockIds||[]).map(String).sort().join(',')].join('|');
}
function pairMedia(oldMedia,newMedia) {
  if(oldMedia.length!==newMedia.length) throw new Error('SOURCE_MEDIA_CHANGED: media count differs.');
  const used=new Set();
  return oldMedia.map(old=>{
    const oldIdentity=String(old.identity||'');
    let candidates=oldIdentity && /^((image|video):record:)/.test(oldIdentity)
      ? newMedia.filter((item,i)=>!used.has(i)&&item.kind===old.kind&&item.identity===oldIdentity)
      : newMedia.filter((item,i)=>!used.has(i)&&item.kind===old.kind&&item.id===old.id&&blockKey(item)===blockKey(old));
    if(candidates.length!==1 && !oldIdentity){
      candidates=newMedia.filter((item,i)=>!used.has(i)&&blockKey(item)===blockKey(old));
    }
    if(candidates.length!==1) throw new Error('SOURCE_MEDIA_CHANGED: ambiguous or changed media occurrence identity.');
    const item=candidates[0];
    used.add(newMedia.indexOf(item));
    return {old,item};
  });
}
function extFor(bytes,kind) {
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return kind==='image'?'.png':null;
  if(bytes.subarray(0,3).toString('ascii')==='GIF') return kind==='image'?'.gif':null;
  if(bytes.subarray(0,3).equals(Buffer.from([255,216,255]))) return kind==='image'?'.jpg':null;
  if(bytes.subarray(0,4).toString('ascii')==='RIFF' && bytes.subarray(8,12).toString('ascii')==='WEBP') return kind==='image'?'.webp':null;
  if(bytes.subarray(4,8).toString('ascii')==='ftyp') {
    const code=bytes.subarray(8,12).toString('ascii');
    if(kind==='image' && /^(avif|avis|heic|heix|mif1)$/.test(code))return code.startsWith('avi')?'.avif':'.heic';
    if(kind==='video') return '.mp4';
  }
  if(bytes.subarray(0,4).equals(Buffer.from([0x1A,0x45,0xDF,0xA3]))) return kind==='video'?'.webm':null;
  const head=bytes.toString('utf8').trimStart().slice(0,200);
  if(kind==='image' && (/^<svg[\s>]/i.test(head) || /^<\?xml[\s\S]*?<svg[\s>]/i.test(head))) return '.svg';
  return null;
}
function checkedMediaPath(dir,relative,expectedHash,expectedSize,kind) {
  try {
    const file=inside(dir,relative);
    if(!fs.lstatSync(file).isFile() || fs.statSync(file).size!==expectedSize) return null;
    if(!/^[a-f0-9]{64}$/.test(expectedHash||'')) return null;
    const fd=fs.openSync(file,'r');const buf=Buffer.alloc(256);
    try{fs.readSync(fd,buf,0,buf.length,0);}finally{fs.closeSync(fd);}
    if(!extFor(buf,kind))return null;
    return file;
  } catch {return null;}
}
function putAtomic(file,obj) {
  const t=file+'.next-'+process.pid;
  fs.writeFileSync(t,JSON.stringify(obj,null,2),'utf8');
  fs.renameSync(t,file);
}
function isFeishuHost(url) {
  try {const h=new URL(url).hostname;return /(^|\.)feishu\.cn$/i.test(h);}catch{return false;}
}
async function streamRemote(url,context,page,dest,bytesUsed,budget) {
  const userAgent=await page.evaluate(()=>navigator.userAgent);
  if(!Number.isFinite(budget.spentBytes))budget.spentBytes=Math.max(0,Number(bytesUsed)||0);
  let current=url,resp;
  for(let redirects=0;redirects<6;redirects++) {
    const u=assertApprovedMediaUrl(current);
    const cookies=await context.cookies(current);
    const cookie=cookies.map(c=>c.name+'='+c.value).join('; ');
    const headers={'User-Agent':userAgent};
    if(cookie) headers.Cookie=cookie;
    if(isFeishuHost(page.url()) && isFeishuHost(current)) headers.Referer=page.url();
    resp=await fetch(current,{headers,redirect:'manual',signal:AbortSignal.timeout(10*60*1000)});
    if([301,302,303,307,308].includes(resp.status)) {
      const next=resp.headers.get('location');
      await resp.body?.cancel().catch(()=>{});
      if(!next) throw new Error('Media redirect has no location');
      current=new URL(next,current).toString();
      continue;
    }
    break;
  }
  if(!resp || [301,302,303,307,308].includes(resp.status)) throw new Error('Too many media redirects');
  if(!resp.ok || !resp.body){await resp.body?.cancel().catch(()=>{});throw new Error('Media HTTP '+resp.status);}
  const declared=Number(resp.headers.get('content-length'));
  if(Number.isFinite(declared) && declared>0 && (declared>budget.singleMax || budget.spentBytes+declared>budget.totalMax)) {
    await resp.body.cancel().catch(()=>{});
    throw new Error('MEDIA_BUDGET_EXCEEDED: declared length exceeds safety budget');
  }
  let count=0;
  const guard=new Transform({transform(chunk,enc,cb){
    count+=chunk.length;
    budget.spentBytes+=chunk.length; // Failed/partial transfers count too.
    if(count>budget.singleMax || budget.spentBytes>budget.totalMax) return cb(new Error('MEDIA_BUDGET_EXCEEDED: streamed bytes exceed safety budget'));
    cb(null,chunk);
  }});
  await pipeline(Readable.fromWeb(resp.body),guard,fs.createWriteStream(dest,{flags:'wx'}));
  return count;
}
async function rehydrateBlobUrl(page,item) {
  if(item?.kind!=='image')throw Error('BLOB_REHYDRATION_UNSUPPORTED: only visible source images are eligible');
  const identity=String(item.identity||'');
  const parsed=identity.match(/^image:(record|block):([a-zA-Z0-9_-]+):(\d+)$/);
  if(!parsed)throw Error('BLOB_REHYDRATION_AMBIGUOUS: missing exact record/block and ordinal identity');
  const kind=parsed[1],id=parsed[2],ordinal=Number(parsed[3]);
  const expected=kind==='record' ? (item.recordIds||[]).map(String) : (item.blockIds||[]).map(String);
  if(!expected.includes(id))throw Error('BLOB_REHYDRATION_AMBIGUOUS: source identity does not match expected block');
  const attribute=kind==='record'?'data-record-id':'data-block-id';
  const selector='.docx-image-block['+attribute+'="'+id+'"]';
  let found=false;
  for(let attempt=0;attempt<2 && !found;attempt++){
    if(attempt===1)await page.evaluate(()=>{const el=document.querySelector('.bear-web-x-container');if(el)el.scrollTop=0});
    for(let pos=0;pos<240;pos++){
      if(await page.locator(selector).count()){found=true;break}
      await page.evaluate(()=>{const el=document.querySelector('.bear-web-x-container');if(el)el.scrollTop+=Math.max(350,Math.floor(el.clientHeight*0.7))});
      await page.waitForTimeout(90);
    }
  }
  if(!found)throw Error('BLOB_REHYDRATION_FAILED: image block not mounted');
  const node=page.locator(selector).first();
  await node.scrollIntoViewIfNeeded();
  await page.waitForTimeout(260);
  const fresh=await node.evaluate((el,ordinal)=>{
    const images=[...el.querySelectorAll('img')].filter(x=>!x.closest('.xgplayer,.box-preview-wrap'));
    const img=images[ordinal];
    if(!img)return '';
    return img.currentSrc||img.src||img.getAttribute('src')||'';
  },ordinal);
  if(!fresh.startsWith('blob:'))throw Error('BLOB_REHYDRATION_FAILED: no visible authorized Blob image source');
  return fresh;
}
async function streamBlob(url,page,dest,bytesUsed,budget,item=null) {
  const key='__feishuStream_'+crypto.randomUUID().replace(/-/g,'');
  let fd,count=0;
  if(!Number.isFinite(budget.spentBytes))budget.spentBytes=Math.max(0,Number(bytesUsed)||0);
  try {
    const begin=async candidate=>page.evaluate(async({url,key})=>{
      const resp=await fetch(url);
      if(!resp.ok || !resp.body)throw Error('Blob stream unavailable '+resp.status);
      window[key]={reader:resp.body.getReader()};
    },{url:candidate,key});
    try {await begin(url)}
    catch(error){
      if(!item || item.kind!=='image')throw error;
      // Feishu virtualizes document images and may revoke their earlier
      // temporary Blob URLs. Rehydrate from the same visible source block.
      const fresh=await rehydrateBlobUrl(page,item);
      await begin(fresh);
    }
    fd=fs.openSync(dest,'wx');
    for(;;){
      const chunk=await page.evaluate(async key=>{
        const state=window[key];
        if(!state)throw Error('Blob stream reference expired');
        const {value,done}=await state.reader.read();
        if(done)return {done:true};
        const bytes=value;
        let binary='';
        for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
        return {done:false,base64:btoa(binary),size:bytes.byteLength};
      },key);
      if(chunk.done)break;
      count+=chunk.size;
      budget.spentBytes+=chunk.size;
      if(count>budget.singleMax || budget.spentBytes>budget.totalMax)throw Error('MEDIA_BUDGET_EXCEEDED: Blob stream exceeds hard budget');
      fs.writeSync(fd,Buffer.from(chunk.base64,'base64'));
    }
    return count;
  } finally {
    if(fd!==undefined)fs.closeSync(fd);
    await page.evaluate(async key=>{
      const state=window[key];
      if(state){await state.reader.cancel().catch(()=>{});delete window[key];}
    },key).catch(()=>{});
  }
}
async function validExisting(dir,entry,kind) {
  if(!entry || !entry.localRelativePath || !entry.contentHash || !Number.isFinite(entry.actualSize))return false;
  const file=checkedMediaPath(dir,entry.localRelativePath,entry.contentHash,entry.actualSize,kind);
  return !!file && (await shaFile(file))===entry.contentHash;
}
function rewriteSaved(saved,mappings,html=false) {
  let result=saved;
  for(const {old,entry} of mappings) {
    const uri=old.sourceUrl;
    if(typeof uri!=='string' || !uri) throw new Error('Missing old media source URL');
    const target=entry.localRelativePath.replace(/\\/g,'/');
    result=result.split(uri).join(target);
    if(html) result=result.split(uri.replace(/&/g,'&amp;')).join(target.replace(/&/g,'&amp;'));
  }
  return result;
}
function backupThree(dir,files,projectRoot) {
  const root=path.join(projectRoot,'data','backups','agent-resume-'+Date.now()+'-'+crypto.randomUUID().slice(0,8));
  fs.mkdirSync(root,{recursive:true});
  const manifest={createdAt:new Date().toISOString(),sourceFolder:path.basename(dir),files:[]};
  for(const [key,name] of Object.entries(files)) {
    const source=inside(dir,name);const to=path.join(root,key==='manifest'?'archive.json':key==='html'?'article.html':'original.md');
    fs.copyFileSync(source,to);
    manifest.files.push({key,sourceRelative:name,backupRelative:path.basename(to),sha256:hash(fs.readFileSync(to))});
  }
  fs.writeFileSync(path.join(root,'snapshot.json'),JSON.stringify(manifest,null,2));
  return {root,manifest};
}
function publishThree(dir,files,next,backup) {
  // Compatibility adapter for existing repair scripts; all writes use the
  // same transaction journal / Reader gate. Preserve the caller's backup.
  if(backup?.manifest?.files){
    for(const item of backup.manifest.files){
      const current=inside(dir,files[item.key]);
      if(hash(fs.readFileSync(current))!==item.sha256)
        throw Error('ARCHIVE_CHANGED_EXTERNALLY: source differs from backup');
    }
  }
  return publishArchiveFiles({dir,files,contents:next});
}
async function resumeArchive({document,inventory,policy,context,page,libraryRoot,archiveConfig,limits,confirmUnknown=false,confirmLarge=false,projectRoot=path.resolve(__dirname,'..','..'),downloadOverride=null}) {
  if(!document.scan?.verifiedComplete)throw new Error('SCAN_INCOMPLETE: refuse to resume without stable full-document scan.');
  const existing=locateArchive(libraryRoot,document.documentId);
  if(!existing)throw new Error('ARCHIVE_NOT_FOUND: resume only works on a saved partial/pending archive.');
  const {dir,manifest,manifestFile}=existing;
  if(!['pending_confirmation','partial'].includes(manifest.status)) throw new Error('ARCHIVE_NOT_RESUMABLE: source archive is not pending/partial.');
  if(archiveConfig.downloadImages===false || archiveConfig.downloadVideos===false)throw new Error('MEDIA_DISABLED: resume requires image and video downloads enabled.');
  const files={markdown:manifest.markdownFile,html:manifest.htmlFile||'article.html',manifest:'archive.json'};
  const markdownPath=inside(dir,files.markdown),htmlPath=inside(dir,files.html);
  const savedMd=fs.readFileSync(markdownPath,'utf8'),savedHtml=fs.readFileSync(htmlPath,'utf8');
  const freshRender=renderDocument({document,inventory});
  const freshHtml=freshRender.html;
  const sourceCheck=compareOriginal(savedHtml,freshHtml);
  if(!sourceCheck.match)throw new Error('SOURCE_CHANGED: '+JSON.stringify(sourceCheck)+'; original article preserved.');
  if(manifest.sourceFingerprint && manifest.sourceSnapshotSchema>=2 &&
     snapshotDocument(document).contentFingerprint!==manifest.sourceFingerprint)
    throw Error('SOURCE_CHANGED: stable source Block, link, attachment or media relationship fingerprint differs. Original preserved.');
  const pairs=pairMedia(Array.isArray(manifest.media)?manifest.media:[],inventory);
  if((policy.warnings||[]).some(w=>w.type!=='unknown_size') && !confirmLarge)throw new Error('PREFLIGHT_CONFIRMATION_REQUIRED: '+JSON.stringify(policy.warnings));
  if(policy.unknownCount && !confirmUnknown)throw new Error('UNKNOWN_SIZE_CONFIRMATION_REQUIRED: '+policy.unknownCount+' item(s)');
  // Hard limits apply even when warnings are explicitly confirmed.
  const budget={singleMax:Math.max(1,Number(limits.warnSingleFileMB||300))*MiB,totalMax:Math.max(1,Number(limits.warnTotalMB||1024))*MiB};
  const journalFile=path.join(projectRoot,'data','state','agent-resume-'+document.documentId+'.json');
  const originalHash=await shaFile(manifestFile);
  let journal;
  if(fs.existsSync(journalFile)) {
    journal=readJson(journalFile);
    if(journal.documentId!==document.documentId || journal.sourceManifestHash!==originalHash)throw new Error('RESUME_JOURNAL_MISMATCH: source manifest changed since previous attempt.');
  } else journal={version:1,documentId:document.documentId,sourceManifestHash:originalHash,startedAt:new Date().toISOString(),items:{}};
  fs.mkdirSync(path.dirname(journalFile),{recursive:true});
  let used=Object.values(journal.items).reduce((sum,v)=>sum+(Number(v.actualSize)||0),0);
  budget.spentBytes=Math.max(used,Number(journal.transferSpentBytes)||0);
  if(budget.spentBytes>budget.totalMax) throw new Error('MEDIA_BUDGET_EXCEEDED: previous progress exceeds task budget');
  const results=[];
  for(const {old,item} of pairs) {
    let entry=journal.items[old.id];
    if(!await validExisting(dir,entry,old.kind))entry=null;
    if(!entry && old.status==='downloaded' && await validExisting(dir,old,old.kind))entry={...old};
    if(!entry) {
      const kindDir=old.kind==='video'?'videos':'images';
      const stageDir=path.join(dir,'assets',kindDir,'.staging');
      fs.mkdirSync(stageDir,{recursive:true});
      const stage=path.join(stageDir,'resume-'+crypto.randomUUID()+'.part');
      try {
        if(downloadOverride)await downloadOverride({old,item,stage,used,budget});
        else if(item.url.startsWith('blob:'))await streamBlob(item.url,page,stage,used,budget,item);
        else if(/^https:\/\//i.test(item.url))await streamRemote(item.url,context,page,stage,used,budget);
        else throw new Error('UNSUPPORTED_MEDIA_URL');
        const size=fs.statSync(stage).size;
        if(!size)throw new Error('EMPTY_MEDIA');
        const head=Buffer.alloc(256);
        const fd=fs.openSync(stage,'r');try{fs.readSync(fd,head,0,head.length,0);}finally{fs.closeSync(fd);}
        const ext=extFor(head,old.kind);
        if(!ext)throw new Error('INVALID_MEDIA_TYPE: downloaded bytes are not a supported '+old.kind);
        const contentHash=await shaFile(stage);
        const localRelativePath='assets/'+kindDir+'/sha256-'+contentHash+ext;
        const canonical=inside(dir,localRelativePath);
        if(fs.existsSync(canonical)) {
          if((await shaFile(canonical))!==contentHash)throw new Error('MEDIA_HASH_MISMATCH: existing canonical asset');
        } else fs.linkSync(stage,canonical); // atomic same-volume publish, never expose a half-copied canonical file
        entry={id:old.id,kind:old.kind,localRelativePath,actualSize:size,contentHash,status:'downloaded'};
        used+=size;
        journal.items[old.id]=entry;
        journal.transferSpentBytes=budget.spentBytes;
        putAtomic(journalFile,journal);
      } catch(e) {
        journal.transferSpentBytes=budget.spentBytes;
        putAtomic(journalFile,journal);
        throw new Error('RESUME_MEDIA_FAILED '+old.id+': '+e.message);
      }
      // Deliberately preserve .staging for forensic recovery; no automatic removal.
    }
    results.push({old,item,entry});
  }
  // Re-render from the same scan that passed the source/Block comparison.
  // Partial archives may contain visible offline placeholders with no source
  // URL, so string replacement alone cannot correctly restore media markup.
  const localizedInventory=inventory.map(item=>{
    const mapped=results.find(result=>result.item===item);
    return mapped ? {...item,...mapped.entry,status:'downloaded',localRelativePath:mapped.entry.localRelativePath} : item;
  });
  const rebuilt=renderDocument({document,inventory:localizedInventory});
  const nextMd=rebuilt.markdown;
  const nextHtml=rebuilt.html;
  for(const {old} of results) {
    if(nextMd.includes(old.sourceUrl) || nextHtml.includes(old.sourceUrl) ||
       nextHtml.includes(old.sourceUrl.replace(/&/g,'&amp;')))throw new Error('REMOTE_MEDIA_REFERENCE_REMAINS');
  }
  const remoteRefs=[...nextHtml.matchAll(/<(?:img|video|source)\b[^>]*\bsrc="([^"]+)"/gi)].map(x=>x[1]).filter(u=>/^(https?:|blob:)/i.test(u));
  if(remoteRefs.length)throw new Error('REMOTE_MEDIA_REFERENCE_REMAINS: '+remoteRefs.length);
  const owner=new Map();
  const nextMedia=results.map(({old,item,entry})=>{
    const identity=old.kind+':'+entry.contentHash;
    const first=owner.get(identity)||null;
    if(!first)owner.set(identity,old.id);
    return {...old,identity:item.identity||old.identity||null,localRelativePath:entry.localRelativePath,actualSize:entry.actualSize,contentHash:entry.contentHash,status:'downloaded',error:null,duplicateOf:first};
  });
  const fullInventory=nextMedia.map(x=>({...x,url:x.sourceUrl}));
  const sourceQuality=evaluateQuality({
    document,inventory:fullInventory,audit:rebuilt.audit,diagnostics:inventory.diagnostics||[],
    policy:{...policy,confirmedUnknown:!!confirmUnknown,confirmedLarge:!!confirmLarge},
  });
  const nextManifest={
    ...manifest,status:sourceQuality.status,scan:document.scan,
    attachments:rebuilt.audit.attachmentCandidates,mediaDiagnostics:inventory.diagnostics||[],quality:sourceQuality,
    policy:{...policy,confirmedUnknown:!!confirmUnknown,confirmedLarge:!!confirmLarge},
    media:nextMedia,storage:storageSummary(nextMedia),
    completedAt:new Date().toISOString(),
  };
  const originalDigests={markdown:hash(savedMd),html:hash(savedHtml),manifest:originalHash};
  for(const [key,relative] of Object.entries(files)) {
    if(hash(fs.readFileSync(inside(dir,relative)))!==originalDigests[key])throw Error('ARCHIVE_CHANGED_EXTERNALLY: original changed before publication');
  }
  const publication=publishArchiveFiles({dir,files,projectRoot,
    contents:{markdown:nextMd,html:nextHtml,manifest:JSON.stringify(nextManifest,null,2)}});
  return {archiveDir:dir,status:nextManifest.status,manifest:nextManifest,backupDir:publication.backupDir,warningsRequireConfirmation:false};
}
module.exports={resumeArchive,normalizeReader,compareOriginal,pairMedia,extFor,rewriteSaved,locateArchive,validExisting,streamRemote,streamBlob,rehydrateBlobUrl,backupThree,publishThree};
