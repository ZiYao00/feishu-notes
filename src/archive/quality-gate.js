'use strict';
// Single, side-effect-free source of truth for capture status and quality.
// 'complete' in the legacy status field is kept for older Readers; delivery
// certification is separate and requires physical files and Reader QA.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KNOWN_MEDIA_STATES = new Set(['downloaded','pending','failed','skipped_by_config','skipped_by_media_limit','skipped_by_policy','unavailable']);
const CAPTURE_STATES = new Set(['complete','partial','pending_confirmation']);
const hashFile = async file => {
  const digest=crypto.createHash('sha256');
  for await(const chunk of fs.createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
};
function safeLocalFile(root, rel) {
  if(typeof rel!=='string'||!rel||path.isAbsolute(rel)||rel.includes('\0'))throw Error('UNSAFE_ARCHIVE_PATH');
  const full=path.resolve(root,rel),r=path.relative(root,full);
  if(!r||r==='..'||r.startsWith('..'+path.sep)||path.isAbsolute(r))throw Error('UNSAFE_ARCHIVE_PATH');
  let parent=path.resolve(root);
  for(const part of r.split(path.sep).slice(0,-1)){
    parent=path.join(parent,part);
    if(fs.existsSync(parent)&&fs.lstatSync(parent).isSymbolicLink())throw Error('UNSAFE_ARCHIVE_SYMLINK');
  }
  if(fs.existsSync(full)&&fs.lstatSync(full).isSymbolicLink())throw Error('UNSAFE_ARCHIVE_SYMLINK');
  return full;
}
function countStatuses(media){
 const out={};for(const x of media)out[x.status||'missing']=(out[x.status||'missing']||0)+1;return out;
}
function evaluateQuality({document,inventory=[],audit=null,diagnostics=[],readerQa=null,policy={},pendingConfirmation=false}){
 const media=Array.from(inventory);
 const coverage=audit||{totalBlocks:0,rendered:0,emptyVerified:0,unsupportedVisible:0,failed:0,attachmentCandidates:[],blockResults:[]};
 const attachments=Array.isArray(coverage.attachmentCandidates)?coverage.attachmentCandidates:[];
 const blocks=Array.isArray(coverage.blockResults)?coverage.blockResults:[];
 const issues=[];
 if(policy?.provisionalAssetReuse===true)issues.push('historical_media_bytes_unverified');
  const sourceScanVerified=document?.scan?.verifiedComplete===true;
 if(!sourceScanVerified)issues.push('source_scan_unverified');
 if(document?.schema===1)issues.push('source_snapshot_missing_resource_fingerprints');
 const calloutBlocks=(document?.blocks||[]).filter(b=>/docx-callout-block/.test(b.className||''));
 if(calloutBlocks.length && (!document?.scan?.calloutCoverage ||
    document.scan.calloutCoverage.total!==calloutBlocks.length ||
    document.scan.calloutCoverage.resolved!==calloutBlocks.length ||
    document.scan.calloutCoverage.unresolved?.length ||
    document.scan.calloutCoverage.reconstructionErrors?.length))issues.push('callout_content_unverified');
 if(!Number.isInteger(coverage.totalBlocks)||coverage.totalBlocks<1 ||
    blocks.length!==coverage.totalBlocks ||
    coverage.totalBlocks!==Number(document?.scan?.blockCount??document?.blocks?.length))issues.push('block_coverage_mismatch');
 if((coverage.failed||0)>0)issues.push('block_conversion_failed');
 if(blocks.some(b=>!['rendered','empty_verified','unsupported_visible','failed','represented_in_parent'].includes(b.status)))issues.push('unknown_block_result');
 const mediaIds=new Set();
 for(const item of media){
  if(!item.id||mediaIds.has(item.id))issues.push('media_identity_collision');
  mediaIds.add(item.id);
  if(!KNOWN_MEDIA_STATES.has(item.status))issues.push('unknown_media_state');
  if(!Array.isArray(item.blockIds)||item.blockIds.length===0)issues.push('unlinked_media_occurrence');
  if(item.status==='downloaded'&&(!item.localRelativePath||!item.contentHash||!/^[0-9a-f]{64}$/i.test(item.contentHash)))issues.push('unverifiable_downloaded_media');
 }
 const unresolvedAttachments=attachments.filter(a=>a.status!=='downloaded');
 const unresolvedMedia=media.filter(x=>x.status!=='downloaded');
 const unresolvedDiagnostics=(diagnostics||[]).filter(d=>!d.resolved);
 const sheetFailures=(document?.embeddedSheets||[]).filter(x=>x.status==='failed');
 const unsupported=coverage.unsupportedVisible||0;
 const contentTrusted=sourceScanVerified&&!issues.length;
 const completeCaptured=contentTrusted&&!unsupported&&!unresolvedAttachments.length&&!unresolvedMedia.length&&!unresolvedDiagnostics.length&&!sheetFailures.length;
 const status=pendingConfirmation?'pending_confirmation':completeCaptured?'complete':'partial';
 const verdict=!contentTrusted?'unverified':completeCaptured?'complete_candidate':'partial_candidate';
 return {
   schema:3,sourceScanVerified,blockCoverage:coverage,unresolvedAttachmentCount:unresolvedAttachments.length,
   mediaDiscoveryErrors:unresolvedDiagnostics.length,sheetErrors:sheetFailures.length,
   mediaCounts:countStatuses(media),unresolvedMediaCount:unresolvedMedia.length,
   issues:[...new Set(issues)],verified:completeCaptured,status,verdict,
   readerQa:readerQa&&readerQa.passed===true?{passed:true,checkedAt:readerQa.checkedAt||null,sourceDigest:readerQa.sourceDigest||null}:null,
   deliveryCertified:completeCaptured&&readerQa?.passed===true,
   publicationEligible:contentTrusted&&readerQa?.passed===true,
 };
}
async function verifyStoredArchive({dir,manifest,readerQa=null}){
 const claims=assessManifestClaims(manifest);
 const issues=[...claims.issues],warnings=[...claims.warnings],media=Array.isArray(manifest.media)?manifest.media:[];
 const fileInfo={};
 for(const [label,relative] of [['markdown',manifest.markdownFile],['html',manifest.htmlFile||'article.html'],['manifest','archive.json']]){
  try{
   const file=safeLocalFile(dir,relative),stat=fs.statSync(file);
   if(!stat.isFile()||stat.size===0)throw Error('missing_or_empty');
   fileInfo[label]={bytes:stat.size,sha256:await hashFile(file)};
  }catch(err){issues.push(label+': '+err.message)}
 }
 let physicalOk=0;
 for(const item of media){
  if(item.status!=='downloaded')continue;
  try{
   if(!/^[0-9a-f]{64}$/i.test(item.contentHash||''))throw Error('missing_sha256');
   const file=safeLocalFile(dir,item.localRelativePath),st=fs.statSync(file);
   if(!st.isFile()||st.size!==item.actualSize)throw Error('invalid_file_size');
   const sha=await hashFile(file);
   if(sha!==item.contentHash)throw Error('sha256_mismatch');
   physicalOk++;
  }catch(err){issues.push('media '+String(item.id||'?')+': '+err.message)}
 }
 if(manifest.status!=='complete')warnings.push('archive_state_'+String(manifest.status||'unknown'));
 if(manifest.quality?.sourceScanVerified!==true)warnings.push('source_scan_not_certified');
 if(manifest.quality?.issues?.length)warnings.push(...manifest.quality.issues);
 if(!manifest.quality||manifest.quality.schema!==3)warnings.push('legacy_quality_unverified');
 if(manifest.quality?.unresolvedAttachmentCount>0)warnings.push('unresolved_attachments');
 if(media.some(x=>x.status!=='downloaded'))warnings.push('unresolved_media');
 if(manifest.quality?.mediaDiscoveryErrors>0)warnings.push('unresolved_media_discovery');
 if((manifest.embeddedSheets||[]).some(x=>x.status==='failed'))warnings.push('failed_sheets');
 const sourceVerified=manifest.quality?.sourceScanVerified===true&&!claims.issues.length;
 const complete=manifest.status==='complete'&&manifest.quality?.verified===true&&sourceVerified&&!warnings.length&&!issues.length&&physicalOk===media.length;
 const candidateVerified=sourceVerified&&!issues.length&&physicalOk===media.filter(x=>x.status==='downloaded').length;
 const qaBound=readerQa?.passed===true&&readerQa.sourceDigest===fileInfo.manifest?.sha256&&
   readerQa.contentDigests?.html===fileInfo.html?.sha256&&
   readerQa.contentDigests?.markdown===fileInfo.markdown?.sha256;
 const verdict=!candidateVerified?'unverified':complete?(qaBound?'complete_verified':'complete_candidate'):(qaBound?'partial_verified':'partial_candidate');
 const deliveryCertified=complete&&qaBound;
 return {valid:complete,verdict,deliveryCertified,partialVerified:verdict==='partial_verified',
   fileInfo,physicalMediaCount:physicalOk,mediaCount:media.length,issues,warnings,
   status:manifest.status||'unknown',qualityVerified:manifest.quality?.verified===true};
}
function assessManifestClaims(manifest){
 const issues=[],warnings=[];
 const media=Array.isArray(manifest?.media)?manifest.media:[];
 const quality=manifest?.quality||{};
 if(!CAPTURE_STATES.has(manifest?.status))issues.push('invalid_archive_state');
  if(manifest?.policy?.provisionalAssetReuse===true)issues.push('historical_media_bytes_unverified');
 if(quality.schema!==3)issues.push('legacy_or_missing_quality');
 if(quality.sourceScanVerified!==true||manifest?.scan?.verifiedComplete!==true)issues.push('unverified_source_scan');
 if(manifest?.scan?.calloutCoverage &&
   (manifest.scan.calloutCoverage.total!==manifest.scan.calloutCoverage.resolved ||
    manifest.scan.calloutCoverage.unresolved?.length ||
    manifest.scan.calloutCoverage.reconstructionErrors?.length))issues.push('callout_content_unverified');
 if((quality.issues||[]).length)issues.push(...quality.issues);
 if(quality.blockCoverage?.totalBlocks!==manifest?.scan?.blockCount)issues.push('block_coverage_mismatch');
 if((quality.blockCoverage?.failed||0)>0)issues.push('block_conversion_failed');
 if(quality.mediaCounts&&JSON.stringify(quality.mediaCounts)!==JSON.stringify(countStatuses(media)))issues.push('media_state_counts_stale');
 if(quality.unresolvedAttachmentCount>0)warnings.push('unresolved_attachments');
 if(quality.unresolvedMediaCount>0||media.some(m=>m.status!=='downloaded'))warnings.push('unresolved_media');
 if(quality.mediaDiscoveryErrors>0)warnings.push('unresolved_media_discovery');
 if(quality.sheetErrors>0)warnings.push('failed_sheets');
 if(manifest?.status==='complete' && (quality.verified!==true||warnings.length))issues.push('false_complete_manifest');
 if(manifest?.status!=='complete')warnings.push('incomplete_archive_state');
 const clean=issues.length===0;
 return {valid:clean&&manifest?.status==='complete'&&!warnings.length,
   verdict:!clean?'unverified':warnings.length?'partial_candidate':'complete_candidate',
   issues:[...new Set(issues)],warnings:[...new Set(warnings)]};
}
function summarizeManifest(manifest,inspection=null){
 const media=Array.isArray(manifest?.media)?manifest.media:[];
 const claims=assessManifestClaims(manifest);
 return {
   documentId:manifest?.documentId||null,status:manifest?.status||'missing',
   verdict:inspection?.verdict||claims.verdict,qualityVerified:manifest?.quality?.verified===true,
   scanVerified:manifest?.quality?.sourceScanVerified===true,
   sourceBlockCount:manifest?.scan?.blockCount??null,
   mediaCount:media.length,mediaStatuses:countStatuses(media),
   downloadedMedia:media.filter(x=>x.status==='downloaded').length,
   attachmentCount:manifest?.attachments?.length??0,
   unresolvedAttachments:manifest?.quality?.unresolvedAttachmentCount??null,
   qualityIssues:claims.issues,qualityWarnings:claims.warnings,
   deliveryCertified:inspection?.deliveryCertified===true,
 };
}
module.exports={KNOWN_MEDIA_STATES,CAPTURE_STATES,evaluateQuality,verifyStoredArchive,safeLocalFile,hashFile,countStatuses,assessManifestClaims,summarizeManifest};
