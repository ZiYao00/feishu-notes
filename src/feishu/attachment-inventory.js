'use strict';
// Describe Feishu file cards without erasing undownloaded content.
// Only capture normal hyperlink URLs; an interactive preview/download button
// must not be mistaken for an authenticated direct download URL.
function clean(s){return String(s||'').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/\p{Cf}/gu,'').replace(/\s+/g,' ').trim();}
function inferAttachments(block) {
  const html=String(block.html||'');
  if(!/docx-file-block/.test(html))return [];
  // Video view blocks have their own media entry. They are not downloadable
  // generic file attachments for purposes of the file-completeness report.
  if((block.media||[]).some(m=>m.tag==='video'||m.tag==='source'))return [];
  const filenameMatch=html.match(/class="[^"]*\bfile-name\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  const previewMatch=html.match(/class="[^"]*preview-footer-v2__container-text[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  const fallback=String(block.text||'').replace(/\p{Cf}/gu,'').replace(/\s+/g,' ').trim();
  const title=clean(filenameMatch?.[1]||previewMatch?.[1]||fallback)||'未识别的飞书附件';
  const sizeFromHtml=clean((html.match(/class="[^"]*\bfile-desc\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i)||[])[1]||'');
  const sizeMatch=(fallback+' '+sizeFromHtml).match(/(\d+(?:\.\d+)?)\s*(GB|MB|KB|B)\b/i);
  const sizeBytes=sizeMatch?Math.round(Number(sizeMatch[1])*({B:1,KB:1024,MB:1024**2,GB:1024**3}[sizeMatch[2].toUpperCase()])):null;
  const saved=Array.isArray(block.attachments)?block.attachments:[];
  if(saved.length)return saved.map(item=>({...item,
    name:item.name||title,sizeBytes:Number.isFinite(item.sizeBytes)?item.sizeBytes:sizeBytes,
    sizeText:item.sizeText||sizeMatch?.[0]||null,status:item.status||'unresolved',
  }));
  return [{blockId:String(block.id),name:title,sizeBytes,sizeText:sizeMatch?.[0]||null,status:'unresolved',url:null,source:'feishu-file-block'}];
}
function enrichAttachmentBlocks(document){
  return {...document,blocks:(document.blocks||[]).map(b=>({...b,attachments:inferAttachments(b)}))};
}
module.exports={inferAttachments,enrichAttachmentBlocks};
