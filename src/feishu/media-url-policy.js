'use strict';
// Conservative allowlist for Feishu-served media. Do not fetch arbitrary
// document-provided URLs or follow redirects to internal/private hosts.
// Additional CDN hosts require a reviewed code change, not automatic learning.
const APPROVED=['feishu.cn','larksuite.com','feishucdn.com','larksuitecdn.com'];
function approvedHost(host){
 const lower=String(host||'').toLowerCase().replace(/\.$/,'');
 return APPROVED.some(base=>lower===base||lower.endsWith('.'+base));
}
function assertApprovedMediaUrl(raw){
 let url;
 try{url=new URL(raw)}catch{throw Error('MEDIA_URL_INVALID')}
 const host=url.hostname.toLowerCase();
 if(url.protocol!=='https:'||url.username||url.password||
    (url.port && url.port!=='443')||!approvedHost(host))
   throw Error('MEDIA_URL_NOT_APPROVED: only authorized Feishu/CDN HTTPS hosts');
 if(!host||host==='localhost'||host.endsWith('.localhost')||/^\[?[0-9a-f:.]+\]?$/i.test(host))
   throw Error('MEDIA_URL_NOT_APPROVED: IP/local endpoints rejected');
 return url;
}
module.exports={assertApprovedMediaUrl,approvedHost,APPROVED};
