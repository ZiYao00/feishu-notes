#!/usr/bin/env node
'use strict';
// Authorized candidate only: no writes into library/, no stale-lock deletion,
// at most 100 attempted image/video transfers, all other assets recorded as skipped.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {loadConfig}=require('../src/config/load-config');
const {launchProfile}=require('../src/browser/browser-manager');
const {scanFeishuDocument}=require('../src/feishu/scanner');
const {buildMediaInventory,evaluateMediaPolicy}=require('../src/feishu/media-inventory');
const {createArchive}=require('../src/archive/archive-writer');
const {streamRemote,streamBlob,extFor}=require('../src/archive/agent-resume');
const {acquireCaptureLock}=require('../src/archive/capture-lock');
const {parseDocumentUrl}=require('./agent-capture');
const {snapshotDocument,summarizeSnapshot}=require('../src/archive/source-snapshot');
async function main(){
  const parsed=parseDocumentUrl(process.argv[2]);
  const config=loadConfig();const release=acquireCaptureLock(config.projectRoot,parsed.documentId);
  let browser;
  try {
    const launched=await launchProfile({
      chromePath:config.browser.chromePath,profileRoot:config.browser.profileRoot,profileName:'default',
      targetUrl:parsed.url,diskCacheMB:config.browser.diskCacheMB,mediaCacheMB:config.browser.mediaCacheMB,
    });
    const scan=await scanFeishuDocument({cdpEndpoint:launched.cdpEndpoint,targetUrl:parsed.url});
    browser=scan.browser;
    const {document,context,page}=scan;
    if(document.loginRequired||document.permissionDenied)throw Error('Authorization unavailable');
    const snapshot=snapshotDocument(document);
    const stamp=Date.now()+'-'+crypto.randomUUID().slice(0,8);
    const state=path.join(config.projectRoot,'data','tmp','source-audits',parsed.documentId);
    fs.mkdirSync(state,{recursive:true});
    const snapshotFile=path.join(state,'scan-'+stamp+'.json');
    fs.writeFileSync(snapshotFile,JSON.stringify(snapshot,null,2),{flag:'wx'});
    console.log(JSON.stringify({event:'candidate_scan',summary:summarizeSnapshot(snapshot)}));
    if(!document.scan?.verifiedComplete)throw Error('SCAN_INCOMPLETE: source snapshot saved; no media transfer attempted');
    const inventory=await buildMediaInventory({document,context,page});
    const policy=evaluateMediaPolicy(inventory,config.mediaLimits);
    console.log(JSON.stringify({event:'candidate_media_preflight',count:inventory.length,unknown:policy.unknownCount,knownBytes:policy.knownTotal,warnings:policy.warnings.map(v=>v.type),diagnostics:(inventory.diagnostics||[]).length,approvedMax:100}));
    const candidateRoot=path.join(config.projectRoot,'data','tmp','archive-candidates',parsed.documentId,'live-'+stamp);
    // confirmLarge allows a bounded 100-item candidate in the presence of a >100
    // warning. This does NOT claim authorization to fetch item 101+.
    const result=await createArchive({
      document,inventory,policy,context,page,archiveConfig:config.archive,libraryRoot:candidateRoot,
      confirmLarge:true,agentSafe:true,
      mediaLimits:config.mediaLimits,
      safeMediaTransport:{streamRemote,streamBlob,extFor},
      maxMediaDownloads:100,
    });
    const sourceDir=path.join(result.archiveDir,'.source');fs.mkdirSync(sourceDir,{recursive:true});
    fs.copyFileSync(snapshotFile,path.join(sourceDir,'source-blocks.json'));
    const mediaCounts={};for(const x of result.manifest.media)mediaCounts[x.status]=(mediaCounts[x.status]||0)+1;
    const report={status:result.status,candidateRoot,sourceDocumentId:parsed.documentId,
      qualityVerified:result.manifest.quality?.verified||false,
      mediaCount:result.manifest.media?.length,mediaStatuses:mediaCounts,
      attachments:result.manifest.attachments?.length||0,
      approvedMediaLimit:100};
    fs.writeFileSync(path.join(result.archiveDir,'candidate-report.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({event:'candidate_complete',...report}));
  }finally{await browser?.close().catch(()=>{});release()}
}
main().catch(e=>{console.error('CANDIDATE_ERROR '+e.message);process.exitCode=1});
