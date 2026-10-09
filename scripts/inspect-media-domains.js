'use strict';
const fs=require('fs'),path=require('path');
const {loadConfig}=require('../src/config/load-config');
const root=path.resolve(loadConfig().projectRoot,'data','tmp','archive-candidates');
const summary=[];
if(fs.existsSync(root))for(const group of fs.readdirSync(root,{withFileTypes:true})){
 if(!group.isDirectory())continue;
 for(const run of fs.readdirSync(path.join(root,group.name),{withFileTypes:true})){
  if(!run.isDirectory())continue;
  for(const doc of fs.readdirSync(path.join(root,group.name,run.name),{withFileTypes:true})){
   if(!doc.isDirectory())continue;
   const f=path.join(root,group.name,run.name,doc.name,'archive.json');
   if(!fs.existsSync(f))continue;
   const a=JSON.parse(fs.readFileSync(f,'utf8')),hosts={};
   for(const m of a.media||[]){try{const host=new URL(m.sourceUrl).hostname;hosts[host]=(hosts[host]||0)+1}catch{}}
   summary.push({group:group.name,run:run.name,hosts});
  }
 }
}
console.log(JSON.stringify({runs:summary},null,2));
