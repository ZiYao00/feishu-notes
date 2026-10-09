'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),backupRoot=path.join(root,'data','backups');
const folders=fs.readdirSync(backupRoot,{withFileTypes:true}).filter(x=>x.isDirectory()&&
 x.name.startsWith('fidelity-v3-')&&fs.existsSync(path.join(backupRoot,x.name,'baseline.json'))).map(x=>x.name).sort();
if(!folders.length)throw Error('No V3 rollback baseline');
const latest=folders.at(-1),baseline=JSON.parse(fs.readFileSync(path.join(backupRoot,latest,'baseline.json'),'utf8'));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const problems=[];
for(const item of baseline.libraryFiles){
 const dir=fs.readdirSync(path.join(root,'library'),{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>path.join(root,'library',x.name)).find(dir=>{
  try{return JSON.parse(fs.readFileSync(path.join(dir,'archive.json'))).documentId===item.documentId}catch{return false}
 });
 if(!dir){problems.push({documentId:item.documentId,reason:'document_missing'});continue}
 const file=path.join(dir,item.filename);
 if(!fs.existsSync(file)||sha(file)!==item.sha256)problems.push({documentId:item.documentId,filename:item.filename,reason:'hash_changed'});
}
console.log(JSON.stringify({baseline:latest,documents:new Set(baseline.libraryFiles.map(x=>x.documentId)).size,
 filesChecked:baseline.libraryFiles.length,originalsUnchanged:problems.length===0,problems},null,2));
if(problems.length)process.exitCode=5;
