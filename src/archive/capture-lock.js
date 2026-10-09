'use strict';
// All capture commands (including legacy CLI) take this lock.
// It intentionally refuses to break stale locks without a human inspection.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function acquireCaptureLock(projectRoot, documentId) {
  const file = path.join(projectRoot, 'data', 'state', 'capture-global.lock');
  fs.mkdirSync(path.dirname(file), {recursive:true});
  let fd;
  try { fd=fs.openSync(file,'wx'); }
  catch(e) {
    if(e.code==='EEXIST') throw new Error('CAPTURE_LOCKED: inspect data/state/capture-global.lock and the owning process; never delete it automatically.');
    throw e;
  }
  const token=crypto.randomUUID();
  try { fs.writeFileSync(fd,JSON.stringify({token,pid:process.pid,documentId,startedAt:new Date().toISOString()})+'\n'); }
  finally { fs.closeSync(fd); }
  let released=false;
  return function releaseCaptureLock() {
    if(released) return;
    const record=JSON.parse(fs.readFileSync(file,'utf8'));
    if(record.token!==token || record.pid!==process.pid) throw new Error('CAPTURE_LOCK_OWNERSHIP_CHANGED');
    fs.unlinkSync(file); // remove only our own explicitly named lock
    released=true;
  };
}
module.exports={acquireCaptureLock};
