'use strict';
const assert=require('node:assert/strict');
const {CalloutCollector}=require('../src/feishu/callout-collector');
const block={recordId:'callout-parent',id:'512'};
const unit=(id,text=id)=>({type:'unit',recordId:id,html:'<div data-record-id="'+id+'">'+text+'</div>',text});
const gap={type:'placeholder'};
let passed=0;
async function test(name,fn){await fn();console.log('PASS '+name);passed++}
(async()=>{
 await test('reconstructs a complete virtual Callout across overlapping windows',()=>{
  const c=new CalloutCollector();
  c.ingest(block,{items:[unit('a'),unit('b'),gap]});
  c.ingest(block,{items:[gap,unit('b'),unit('c'),gap]});
  c.ingest(block,{items:[gap,unit('c'),unit('d')]});
  const r=c.resolve(block.recordId);
  assert.equal(r.complete,true);assert.deepEqual(r.units.map(x=>x.recordId),['a','b','c','d']);
  assert.equal(c.summarize([block.recordId]).unresolved.length,0);
 });
 await test('refuses missing virtual segments despite observed head and tail',()=>{
  const c=new CalloutCollector();
  c.ingest(block,{items:[unit('a'),gap]});
  c.ingest(block,{items:[gap,unit('c')]});
  const r=c.resolve(block.recordId);
  assert.equal(r.complete,false);assert.equal(r.reason,'callout_virtual_gap');
 });
 await test('refuses missing leading and trailing coverage',()=>{
  const c=new CalloutCollector();
  c.ingest(block,{items:[gap,unit('b'),unit('c'),gap]});
  assert.equal(c.resolve(block.recordId).complete,false);
  assert.equal(c.resolve(block.recordId).reason,'callout_virtual_boundaries_missing');
 });
 await test('refuses ambiguous order and edited nested content',()=>{
  let c=new CalloutCollector();c.ingest(block,{items:[unit('a'),unit('b')]});c.ingest(block,{items:[unit('a'),unit('c')]});
  assert.equal(c.resolve(block.recordId).complete,false);
  c=new CalloutCollector();c.ingest(block,{items:[unit('a','first'),unit('b')]});
  c.ingest(block,{items:[unit('a','changed'),unit('b')]});assert.match(c.resolve(block.recordId).reason,/nested_unit_text_conflict/);
 });
 await test('nested child placeholders cannot be hidden by outer Callout merging',()=>{
  const c=new CalloutCollector();
  c.ingest(block,{items:[unit('a','original'),{type:'unit',recordId:'b',html:'<div class="bear-virtual-renderUnit-placeholder"></div>',text:''}]});
  assert.equal(c.resolve(block.recordId).complete,false);
  assert.match(c.resolve(block.recordId).reason,/nested_virtual_placeholder/);
 });
 await test('transient virtual placeholders recover only with verified complete child variants',()=>{
  const c=new CalloutCollector();
  c.ingest(block,{items:[unit('a'),{type:'unit',recordId:'b',html:'<div class="bear-virtual-renderUnit-placeholder"></div>',text:''}]});
  c.ingest(block,{items:[unit('a'),unit('b','loaded text')]});
  c.ingest(block,{items:[unit('a'),unit('b','loaded text')]});
  assert.equal(c.resolve(block.recordId).complete,true);
 });
 await test('different transient text is ignored only when it contains a virtual placeholder',()=>{
  const c=new CalloutCollector();
  const partial={type:'unit',recordId:'a',text:'loading state',
    html:'<div data-record-id="a"><span class="bear-virtual-renderUnit-placeholder"></span></div>'};
  c.ingest(block,{items:[partial,unit('b')]});
  c.ingest(block,{items:[unit('a','complete settled content'),unit('b')]});
  assert.equal(c.resolve(block.recordId).complete,false);
  c.ingest(block,{items:[unit('a','complete settled content'),unit('b')]});
  assert.equal(c.resolve(block.recordId).complete,true);
 });
 await test('monotone nested loading needs repeated full text',()=>{
  const c=new CalloutCollector();
  c.ingest(block,{items:[unit('a','first'),unit('b')]});
  c.ingest(block,{items:[unit('a','first extended'),unit('b')]});
  assert.equal(c.resolve(block.recordId).complete,false);
  c.ingest(block,{items:[unit('a','first extended'),unit('b')]});
  assert.equal(c.resolve(block.recordId).complete,true);
 });
 await test('independent Callouts never share child maps',()=>{
  const c=new CalloutCollector();c.ingest(block,{items:[unit('a'),unit('b')]});
  c.ingest({recordId:'separate'}, {items:[unit('a')]});
  assert.equal(c.resolve('separate').observed,1);
  assert.equal(c.resolve(block.recordId).observed,2);
 });
 console.log('PASS '+passed+'/'+passed+' Callout collector checks');
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});