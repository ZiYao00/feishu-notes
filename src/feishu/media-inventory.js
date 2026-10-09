const crypto = require('crypto');
const {assertApprovedMediaUrl}=require('./media-url-policy');

function parseTotalBytes(headers) {
  const contentRange = headers['content-range'] || headers['Content-Range'];
  if (contentRange) {
    const match = String(contentRange).match(/\/(\d+)$/);
    if (match) return Number(match[1]);
  }
  const length = headers['content-length'] || headers['Content-Length'];
  if (length && Number.isFinite(Number(length))) return Number(length);
  return null;
}

function extensionFor(contentType, kind) {
  const type = String(contentType || '').toLowerCase().split(';')[0].trim();
  const map = {
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/svg+xml': '.svg',
  };
  return map[type] || (kind === 'video' ? '.mp4' : '.bin');
}

function stableMediaId(item) {
  const match = item.url.match(/\/video\/([^/?]+)/i) || item.url.match(/\/cover\/([^/?]+)/i);
  if (match) return match[1].replace(/[^a-zA-Z0-9._-]/g, '_');
  return crypto.createHash('sha1').update(item.identity || item.url).digest('hex').slice(0, 20);
}

async function probeBlob(page, url) {
  return page.evaluate(async source => {
    const response = await fetch(source);
    if (!response.ok) throw Error('Blob preflight HTTP '+response.status);
    const raw=response.headers.get('content-length');
    const size=raw && Number.isFinite(Number(raw)) ? Number(raw) : null;
    const contentType=response.headers.get('content-type')||'application/octet-stream';
    // Do not materialize the entire Blob solely to discover its size.
    if(response.body)await response.body.cancel().catch(()=>{});
    return { size,contentType,note:size===null?'Blob size could not be probed without reading the body.':null };
  }, url);
}

async function probeRemote(context, url) {
  let response;
  try {
    assertApprovedMediaUrl(url);
    // HEAD never downloads the media body. A ranged GET may be ignored and buffer
    // the full response inside Playwright's APIResponse; never use it for preflight.
    response = await context.request.head(url, {
      timeout: 15000,
      failOnStatusCode: false,
    });
    const headers = response.headers();
    const status = response.status();
    const size = status >= 200 && status < 300 ? parseTotalBytes(headers) : null;
    return {
      status,
      size,
      contentType: headers['content-type'] || '',
      ...(size == null ? { note: 'HEAD did not provide a reliable size; confirm before downloading.' } : {}),
      ...(status < 200 || status >= 400 ? { error: `HEAD HTTP ${status}` } : {}),
    };
  } catch (error) {
    return { status: null, size: null, contentType: '', error: error.message };
  } finally {
    if (response) await response.dispose().catch(() => {});
  }
}

async function buildMediaInventory({ document, context, page }) {
  const inventory = [];
  const diagnostics = [];

  for (const source of document.media) {
    let probe;
    if (source.url.startsWith('blob:')) {
      try {
        probe = await probeBlob(page, source.url);
      } catch (error) {
        probe = { size: null, contentType: '', error: error.message };
      }
    } else if (/^https?:/i.test(source.url)) {
      probe = await probeRemote(context, source.url);
    } else {
      probe = { size: null, contentType: '', error: 'Unsupported media URL scheme.' };
    }

    if (source.url.startsWith('blob:') && probe.error) {
      diagnostics.push({
        type: 'expired_blob',
        kind: source.kind,
        url: source.url,
        blockIds: source.blockIds || [],
        error: probe.error,
      });
      // Preserve the media occurrence in the inventory. Dropping it could
      // falsely certify a partial archive as complete.
    }

    const contentType = probe.contentType || (source.kind === 'video' ? 'video/mp4' : 'application/octet-stream');
    const id = stableMediaId(source);
    const extension = extensionFor(contentType, source.kind);

    inventory.push({
      ...source,
      id,
      size: Number.isFinite(probe.size) ? probe.size : null,
      contentType,
      probeStatus: probe.status ?? null,
      probeError: probe.error || null,
      note: probe.note || null,
      extension,
      localRelativePath: `assets/${source.kind === 'video' ? 'videos' : 'images'}/${id}${extension}`,
      status: 'pending',
    });
  }

  inventory.diagnostics = diagnostics;
  return inventory;
}

function evaluateMediaPolicy(inventory, limits) {
  const warnSingle = Number(limits.warnSingleFileMB || 0) * 1024 * 1024;
  const warnTotal = Number(limits.warnTotalMB || 0) * 1024 * 1024;
  const knownTotal = inventory.reduce((sum, item) => sum + (item.size || 0), 0);
  const unknownCount = inventory.filter(item => item.size == null).length;
  const oversized = warnSingle > 0 ? inventory.filter(item => item.size != null && item.size > warnSingle) : [];

  const warnings = [];
  if (limits.warnFileCount && inventory.length > limits.warnFileCount) {
    warnings.push({ type: 'file_count', message: `Media count ${inventory.length} exceeds warning limit ${limits.warnFileCount}.` });
  }
  if (warnTotal > 0 && knownTotal > warnTotal) {
    warnings.push({ type: 'total_size', message: `Known media size exceeds ${limits.warnTotalMB} MB.` });
  }
  if (oversized.length) {
    warnings.push({ type: 'single_file', message: `${oversized.length} media file(s) exceed ${limits.warnSingleFileMB} MB.` });
  }
  if (limits.warnUnknownSize && unknownCount) {
    warnings.push({ type: 'unknown_size', message: `${unknownCount} media file(s) have unknown size.` });
  }

  return { knownTotal, unknownCount, oversizedCount: oversized.length, warnings };
}

module.exports = {
  buildMediaInventory,
  evaluateMediaPolicy,
};
