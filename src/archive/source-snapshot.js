'use strict';
const crypto=require('crypto');
const {inferAttachments}=require('../feishu/attachment-inventory');
const hash=value=>crypto.createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
// Raw file bytes must never be hashed through JSON.stringify(Buffer).
// Keep hash() unchanged for existing structured-source fingerprints.
const hashBytes=bytes=>{
 if(!Buffer.isBuffer(bytes)&&!(bytes instanceof Uint8Array))throw TypeError('hashBytes expects a Buffer or Uint8Array');
 return crypto.createHash('sha256').update(bytes).digest('hex');
};
function canonicalText(t){return String(t||'').replace(/\p{Cf}/gu,'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();}
function sourceLinks(html){
 const out=[];
 for(const match of String(html||'').matchAll(/<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi)){
  const raw=(match[1]??match[2]).replace(/&amp;/gi,'&').trim();
  if(!raw||/^(javascript:|data:|blob:)/i.test(raw))continue;
  out.push(raw);
 }
 return out;
}
function sourceMedia(block){
 const ordinals=new Map();
 return (block.media||[]).map(m=>{
  const kind=m.tag==='img'?'image':'video';
  const owner=m.ownerRecordId||block.recordId||null;
  const ownerBlock=m.ownerBlockId||block.id;
  const ownerKey=kind+':'+(owner?'record:'+owner:'block:'+ownerBlock);
  const index=ordinals.get(ownerKey)||0;
  ordinals.set(ownerKey,index+1);
  // Expiring Feishu query signatures and Blob URLs never define identity.
  const locator=String(m.url||'');
  let hostPath='';
  if(/^https?:/i.test(locator)){try{const u=new URL(locator);hostPath=u.hostname.toLowerCase()+u.pathname}catch{}}
  const preferred=owner ? kind+':record:'+owner+':'+index : null;
  return {kind,index,identity:preferred||m.identity||kind+':block:'+ownerBlock+':'+index,
    locator:hostPath,context:m.context||'standalone',width:m.width||null,height:m.height||null};
 });
}
function sourceAttachments(block) {
 return inferAttachments(block).map(a=>({blockIdentity:block.recordId?'record:'+block.recordId:'block:'+String(a.blockId||block.id),
   name:canonicalText(a.name),sizeBytes:Number.isFinite(a.sizeBytes)?a.sizeBytes:null,
   url:a.url||null,source:a.source||'feishu-file-block'}));
}
function safeBlock(b,i){
 const text=String(b.text||''),html=String(b.html||''),links=sourceLinks(html);
 const media=sourceMedia(b),attachments=sourceAttachments(b);
 return {
  position:i,id:String(b.id||''),recordId:b.recordId||null,
  className:b.className||'',text,html,
  textHash:hash(canonicalText(text)),htmlBytes:Buffer.byteLength(html),
  linkFingerprint:hash(links),mediaFingerprint:hash(media),attachmentFingerprint:hash(attachments),
  links,media:b.media||[],attachments,table:b.table||null,sheetExtraction:b.sheetExtraction||null,
  nestedBlockIds:[...new Set([...html.matchAll(/data-block-id="([^"]+)"/g)].map(m=>m[1]))],
  nestedRecordIds:[...new Set([...html.matchAll(/data-record-id="([^"]+)"/g)].map(m=>m[1]))],
 };
}
function blockSummary(b){
 const media=sourceMedia(b),attachments=sourceAttachments(b);
 return {blockIdentity:b.recordId?'record:'+b.recordId:'block:'+String(b.id),className:b.className||'',position:b.position||0,
   textHash:b.textHash||hash(canonicalText(b.text)),nestedRefs:b.recordId?(b.nestedRecordIds||[]):(b.nestedBlockIds||[]),
   links:b.links||sourceLinks(b.html),media,attachments,
   table:b.table||null,sheetExtraction:b.sheetExtraction||null};
}
function snapshotDocument(doc){
 const blocks=(doc.blocks||[]).map(safeBlock);
 return {
  schema:2,documentId:doc.documentId,title:doc.title,capturedAt:new Date().toISOString(),
  sourceUrl:doc.sourceUrl,scan:doc.scan,embeddedSheets:doc.embeddedSheets||[],
  blocks,media:doc.media||[],
  contentFingerprint:hash(blocks.map(blockSummary)),
  textFingerprint:hash(blocks.map(b=>({id:b.recordId||b.id,textHash:b.textHash}))),
  linkFingerprint:hash(blocks.map(b=>b.linkFingerprint)),
  mediaFingerprint:hash(blocks.map(b=>b.mediaFingerprint)),
  attachmentFingerprint:hash(blocks.map(b=>b.attachmentFingerprint)),
 };
}
function summarizeSnapshot(s){
 const classes={},attachmentCandidates=[],blank=[];
 for(const b of s.blocks||[]){
  const cls=String(b.className||'').match(/docx-[\w-]+-block/)?.[0]||'unknown';
  classes[cls]=(classes[cls]||0)+1;
  for(const a of sourceAttachments(b))attachmentCandidates.push({blockId:b.id,name:a.name,knownSize:a.sizeBytes!=null});
  if(!canonicalText(b.text)&&!b.media?.length&&!b.table&&!/docx-(sheet|file|view|embed|image)-block/.test(b.className||''))blank.push(b.id);
 }
 return {documentId:s.documentId,capturedAt:s.capturedAt,blocks:(s.blocks||[]).length,scan:s.scan,
   media:(s.media||[]).length,classes,attachmentCandidates:attachmentCandidates.length,
   emptyCandidates:blank.length,contentFingerprint:s.contentFingerprint};
}
function compareSnapshots(a,b){
 const anchor=x=>x.recordId?'record:'+String(x.recordId):'block:'+String(x.id);
 const left=new Map((a.blocks||[]).map(x=>[anchor(x),x]));
 const right=new Map((b.blocks||[]).map(x=>[anchor(x),x]));
 const oldOnly=[...left.keys()].filter(k=>!right.has(k)),newOnly=[...right.keys()].filter(k=>!left.has(k));
 const textChanged=[],classChanged=[],mediaChanged=[],linkChanged=[],attachmentChanged=[];
 for(const id of left.keys())if(right.has(id)){
  const x=blockSummary(left.get(id)),y=blockSummary(right.get(id));
  if(x.textHash!==y.textHash)textChanged.push(id);
  if(x.className!==y.className)classChanged.push(id);
  if(hash(x.media)!==hash(y.media))mediaChanged.push(id);
  if(hash(x.links)!==hash(y.links))linkChanged.push(id);
  if(hash(x.attachments)!==hash(y.attachments))attachmentChanged.push(id);
 }
 const orderA=[...left.keys()],orderB=[...right.keys()];
 const orderChanged=hash(orderA)!==hash(orderB);
 return {aBlocks:left.size,bBlocks:right.size,oldOnly,newOnly,textChanged,classChanged,
  mediaChanged,linkChanged,attachmentChanged,orderChanged,
  sameContent:!(oldOnly.length||newOnly.length||textChanged.length||classChanged.length||
    mediaChanged.length||linkChanged.length||attachmentChanged.length||orderChanged)};
}
module.exports={hash,hashBytes,canonicalText,sourceLinks,sourceMedia,sourceAttachments,safeBlock,blockSummary,
 snapshotDocument,summarizeSnapshot,compareSnapshots};
