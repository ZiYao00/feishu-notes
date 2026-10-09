'use strict';
// Shared physical media integrity for first capture and resume.
// Both paths use the same SHA-256 verification and atomic same-volume staging.
const fs=require('fs'),path=require('path');
const {safeLocalFile,hashFile}=require('./quality-gate');
async function verifyMediaAsset({dir,relative,hash,size}){
 if(!/^[a-f0-9]{64}$/i.test(String(hash||''))||!Number.isSafeInteger(size)||size<1)return null;
 try{
  const file=safeLocalFile(dir,relative),stat=fs.statSync(file);
  if(!stat.isFile()||stat.size!==size)return null;
  if(await hashFile(file)!==hash.toLowerCase())return null;
  return file;
 }catch{return null}
}
async function publishStage({dir,stage,kind,extension}){
 if(!['image','video'].includes(kind))throw Error('MEDIA_UNSUPPORTED_KIND');
 if(!/^\.[a-z0-9]{2,5}$/i.test(String(extension||'')))throw Error('MEDIA_INVALID_EXTENSION');
 const staging=safeLocalFile(dir,path.relative(dir,stage));
 const stat=fs.statSync(staging);
 if(!stat.isFile()||stat.size<1)throw Error('MEDIA_EMPTY_OR_NONFILE');
 const contentHash=await hashFile(staging);
 const relative='assets/'+(kind==='video'?'videos':'images')+'/sha256-'+contentHash+extension;
 const target=safeLocalFile(dir,relative);
 fs.mkdirSync(path.dirname(target),{recursive:true});
 if(fs.existsSync(target)){
  if((await hashFile(target))!==contentHash)throw Error('MEDIA_CANONICAL_HASH_MISMATCH');
 }else fs.linkSync(staging,target);
 return {localRelativePath:relative,contentHash,actualSize:stat.size};
}
module.exports={verifyMediaAsset,publishStage};
