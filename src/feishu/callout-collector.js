'use strict';
// Reconstruct Feishu's nested virtualized Callout content from ordered record
// fragments captured while scrolling. Fail closed unless every observed unit
// belongs to one uniquely connected chain with confirmed head and tail.
// No Feishu API calls, account changes or side effects.
const crypto=require('crypto');
const sha=s=>crypto.createHash('sha256').update(String(s||'')).digest('hex');
const normalize=s=>String(s||'').replace(/\p{Cf}/gu,'').replace(/\s+/g,' ').trim();
class CalloutCollector {
  constructor(){this.entries=new Map();}
  ingest(block,capture){
    const key=String(block.recordId||block.id||'');
    if(!key)return;
    let entry=this.entries.get(key);
    if(!entry){entry={key,children:new Map(),next:new Map(),prev:new Map(),heads:new Set(),tails:new Set(),
      invalid:new Set(),textVariants:new Map(),variantDetails:new Map(),captures:0,hadPlaceholders:false};this.entries.set(key,entry);}
    entry.captures++;
    if(!capture||!Array.isArray(capture.items)){entry.invalid.add('missing_callout_wrapper');return;}
    const items=capture.items;
    if(!items.length)return;
    let first=null,last=null,previous=null;
    for(const node of items){
      if(node.type==='placeholder'){
        entry.hadPlaceholders=true;
        previous=null;
        continue;
      }
      if(node.type!=='unit'||!node.recordId||typeof node.html!=='string'){
        entry.invalid.add('unknown_nested_unit');previous=null;continue;
      }
      const rid=String(node.recordId),text=normalize(node.text),nestedPlaceholder=node.html.includes('bear-virtual-renderUnit-placeholder');
      const variants=entry.textVariants.get(rid)||new Map();
      variants.set(text,(variants.get(text)||0)+1);
      entry.textVariants.set(rid,variants);
      const details=entry.variantDetails.get(rid)||new Map();
      const priorDetail=details.get(text)||{hadPlaceholder:false,maxHtmlLength:0};
      details.set(text,{hadPlaceholder:priorDetail.hadPlaceholder||nestedPlaceholder,
        maxHtmlLength:Math.max(priorDetail.maxHtmlLength,node.html.length)});
      entry.variantDetails.set(rid,details);
      const prior=entry.children.get(rid);
      const variant={recordId:rid,html:node.html,text,nestedPlaceholder};
      // Prefer a fully rendered child, then a longer actual text. HTML size
      // alone is misleading because an unloaded placeholder can be enormous.
      if(!prior ||
        (prior.nestedPlaceholder && !nestedPlaceholder) ||
        (prior.nestedPlaceholder===nestedPlaceholder && (text.length>prior.text.length ||
          (text.length===prior.text.length && node.html.length>prior.html.length))))entry.children.set(rid,variant);
      if(first===null)first=rid;
      if(previous!==null){
        const n=entry.next.get(previous),p=entry.prev.get(rid);
        if(n && n!==rid)entry.invalid.add('ambiguous_successor');
        if(p && p!==previous)entry.invalid.add('ambiguous_predecessor');
        entry.next.set(previous,rid);
        entry.prev.set(rid,previous);
      }
      previous=rid;last=rid;
    }
    if(items[0]?.type==='unit' && first)entry.heads.add(first);
    if(items[items.length-1]?.type==='unit' && last)entry.tails.add(last);
  }
  resolve(key){
    const e=this.entries.get(String(key||''));
    if(!e)return {complete:false,reason:'callout_not_observed',units:[],observed:0};
    const fail=(reason)=>({complete:false,reason,units:[],observed:e.children.size,captures:e.captures,
      placeholderSeen:e.hadPlaceholders});
    if(e.invalid.size)return fail([...e.invalid].join(','));
    const unresolvedNested=[...e.children.values()].filter(x=>x.nestedPlaceholder);
    if(unresolvedNested.length)return fail('nested_virtual_placeholder');
    const unstable=[];
    for(const [id,variants] of e.textVariants){
      if(variants.size<2)continue;
      const selected=e.children.get(id);
      if(!selected)continue;
      const complete=selected.text;
      const monotone=[...variants.keys()].every(t=>!t || complete.includes(t) ||
        e.variantDetails.get(id)?.get(t)?.hadPlaceholder===true);
      if(!monotone || (variants.get(complete)||0)<2)unstable.push(id);
    }
    if(unstable.length)return fail('nested_unit_text_conflict');
    if(e.heads.size!==1||e.tails.size!==1)return fail('callout_virtual_boundaries_missing');
    const head=[...e.heads][0],tail=[...e.tails][0],ordered=[],seen=new Set();
    let current=head;
    while(current && !seen.has(current)){
      seen.add(current);
      const node=e.children.get(current);
      if(!node)return fail('missing_nested_unit');
      ordered.push(node);
      current=e.next.get(current)||null;
    }
    if(current)return fail('callout_order_cycle');
    if(ordered.at(-1)?.recordId!==tail||ordered.length!==e.children.size)
      return fail('callout_virtual_gap');
    if(e.prev.has(head)||e.next.has(tail))return fail('callout_inconsistent_endpoints');
    return {complete:true,reason:'contiguous_records',units:ordered,observed:e.children.size,
      captures:e.captures,placeholderSeen:e.hadPlaceholders,contentFingerprint:sha(ordered.map(x=>x.recordId+':'+sha(x.text)).join('|'))};
  }
  summarize(keys){
    const details=keys.map(key=>{const a=this.resolve(key);return {key:String(key),complete:a.complete,
      reason:a.reason,observed:a.observed,captures:a.captures||0,placeholderSeen:!!a.placeholderSeen};});
    return {total:details.length,resolved:details.filter(x=>x.complete).length,
      unresolved:details.filter(x=>!x.complete),recordCounts:details.map(x=>x.observed)};
  }
}
module.exports={CalloutCollector};
