(() => {
  const root = document.documentElement;
  const body = document.body;
  const themeButton = document.querySelector('[data-theme-toggle]');
  const tocToggle = document.querySelector('[data-toc-toggle]');
  const tocCollapse = document.querySelector('[data-toc-collapse]');
  const toc = document.querySelector('[data-reader-toc]');
  const tocList = document.querySelector('[data-reader-toc-list]');
  const splitter = document.querySelector('[data-reader-splitter]');
  const progress = document.querySelector('[data-reader-progress]');
  const dialog = document.querySelector('[data-media-dialog]');
  const dialogVideo = dialog?.querySelector('video');
  const dialogImage = dialog?.querySelector('img');
  const dialogClose = dialog?.querySelector('[data-dialog-close]');

  const themeNames = { system: '系统', light: '浅色', dark: '深色' };
  const getTheme = () => localStorage.getItem('feishu-notes-theme') || 'system';
  const applyTheme = theme => {
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    if (themeButton) themeButton.textContent = themeNames[theme] || theme;
  };
  applyTheme(getTheme());

  themeButton?.addEventListener('click', () => {
    const current = getTheme();
    const next = current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system';
    localStorage.setItem('feishu-notes-theme', next);
    applyTheme(next);
  });

  const TOC_WIDTH_KEY = 'feishu-notes-toc-width';
  const TOC_COLLAPSED_KEY = 'feishu-notes-toc-collapsed';
  const TOC_DEFAULT = 208;
  const TOC_MIN = 160;
  const TOC_ABSOLUTE_MAX = 720;

  const maxTocWidth = () => {
    if (innerWidth < 1200) return TOC_DEFAULT;
    return Math.max(TOC_MIN, Math.min(TOC_ABSOLUTE_MAX, innerWidth - 560));
  };

  const clampTocWidth = value => Math.round(Math.max(TOC_MIN, Math.min(maxTocWidth(), Number(value) || TOC_DEFAULT)));

  const applyTocWidth = (value, persist = false) => {
    const width = clampTocWidth(value);
    root.style.setProperty('--reader-toc-width', width + 'px');
    if (splitter) {
      splitter.setAttribute('aria-valuemin', String(TOC_MIN));
      splitter.setAttribute('aria-valuemax', String(maxTocWidth()));
      splitter.setAttribute('aria-valuenow', String(width));
    }
    if (persist) localStorage.setItem(TOC_WIDTH_KEY, String(width));
    return width;
  };

  const storedWidth = Number(localStorage.getItem(TOC_WIDTH_KEY));
  applyTocWidth(Number.isFinite(storedWidth) && storedWidth > 0 ? storedWidth : TOC_DEFAULT);

  const collapsed = localStorage.getItem(TOC_COLLAPSED_KEY) === '1';
  if (collapsed) body.classList.add('toc-collapsed');

  tocCollapse?.addEventListener('click', () => {
    body.classList.toggle('toc-collapsed');
    localStorage.setItem(TOC_COLLAPSED_KEY, body.classList.contains('toc-collapsed') ? '1' : '0');
  });

  let resizeState = null;

  const finishResize = pointerId => {
    if (!resizeState) return;
    const width = parseFloat(getComputedStyle(root).getPropertyValue('--reader-toc-width')) || TOC_DEFAULT;
    applyTocWidth(width, true);
    body.classList.remove('is-resizing');
    if (splitter && pointerId != null && splitter.hasPointerCapture?.(pointerId)) {
      splitter.releasePointerCapture(pointerId);
    }
    resizeState = null;
  };

  splitter?.addEventListener('pointerdown', event => {
    if (innerWidth < 1200 || body.classList.contains('toc-collapsed')) return;
    if (event.button !== 0) return;
    event.preventDefault();
    const currentWidth = toc?.getBoundingClientRect().width || TOC_DEFAULT;
    resizeState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: currentWidth,
    };
    splitter.setPointerCapture?.(event.pointerId);
    body.classList.add('is-resizing');
  });

  splitter?.addEventListener('pointermove', event => {
    if (!resizeState || event.pointerId !== resizeState.pointerId) return;
    applyTocWidth(resizeState.startWidth + event.clientX - resizeState.startX);
  });

  splitter?.addEventListener('pointerup', event => {
    if (!resizeState || event.pointerId !== resizeState.pointerId) return;
    finishResize(event.pointerId);
  });

  splitter?.addEventListener('pointercancel', event => finishResize(event.pointerId));

  splitter?.addEventListener('dblclick', () => {
    applyTocWidth(TOC_DEFAULT, true);
  });

  splitter?.addEventListener('keydown', event => {
    if (innerWidth < 1200 || body.classList.contains('toc-collapsed')) return;
    const current = parseFloat(getComputedStyle(root).getPropertyValue('--reader-toc-width')) || TOC_DEFAULT;
    const step = event.shiftKey ? 32 : 16;
    let next = null;

    if (event.key === 'ArrowLeft') next = current - step;
    if (event.key === 'ArrowRight') next = current + step;
    if (event.key === 'Home') next = TOC_DEFAULT;
    if (event.key === 'End') next = maxTocWidth();

    if (next == null) return;
    event.preventDefault();
    applyTocWidth(next, true);
  });

  addEventListener('resize', () => {
    if (innerWidth < 1200) return;
    const stored = Number(localStorage.getItem(TOC_WIDTH_KEY));
    const current = parseFloat(getComputedStyle(root).getPropertyValue('--reader-toc-width')) || TOC_DEFAULT;
    applyTocWidth(Number.isFinite(stored) && stored > 0 ? stored : current);
  }, { passive: true });

  tocToggle?.addEventListener('click', () => body.classList.toggle('toc-open'));
  toc?.addEventListener('click', event => {
    if (event.target.closest('a')) body.classList.remove('toc-open');
  });

  const headings = [...document.querySelectorAll('.reader-content h2[id],.reader-content h3[id],.reader-content h4[id]')];
  if (tocList) {
    for (const heading of headings) {
      const link = document.createElement('a');
      link.href = '#' + heading.id;
      link.dataset.level = heading.tagName.slice(1);
      link.textContent = heading.textContent.trim();
      tocList.appendChild(link);
    }
  }

  if (headings.length && tocList) {
    const links = new Map([...tocList.querySelectorAll('a')].map(link => [link.getAttribute('href').slice(1), link]));
    const observer = new IntersectionObserver(entries => {
      const visible = entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (!visible) return;
      for (const link of links.values()) link.classList.remove('active');
      links.get(visible.target.id)?.classList.add('active');
    }, { rootMargin: '-72px 0px -72% 0px', threshold: [0, 1] });
    headings.forEach(heading => observer.observe(heading));
  }

  const mediaBlocks = [...document.querySelectorAll('.reader-block--media')];
  for (const block of mediaBlocks) {
    const items = [...block.querySelectorAll(':scope > .reader-media--standalone')];
    if (items.length < 2) continue;
    block.classList.add('is-media-grid');
    block.dataset.mediaCount = String(items.length);
    const orientations = items.map(item =>
      item.dataset.mediaOrientation ||
      item.querySelector('[data-media-orientation]')?.dataset.mediaOrientation ||
      'unknown'
    );
    if (orientations.every(value => value === 'portrait')) block.classList.add('is-portrait-grid');
    else block.classList.add('is-wide-grid');
  }

  const playIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l10-6.5z"/></svg>';

  const openMedia = ({ kind, src }) => {
    if (!dialog || !src) return;

    if (dialogVideo) {
      dialogVideo.pause();
      dialogVideo.removeAttribute('src');
      dialogVideo.hidden = true;
      dialogVideo.load();
    }
    if (dialogImage) {
      dialogImage.removeAttribute('src');
      dialogImage.hidden = true;
    }

    if (kind === 'image' && dialogImage) {
      dialogImage.src = src;
      dialogImage.hidden = false;
    } else if (dialogVideo) {
      dialogVideo.src = src;
      dialogVideo.hidden = false;
      dialogVideo.load();
    }

    dialog.showModal();
  };

  document.querySelectorAll('.reader-media--table-cell').forEach(figure => {
    const video = figure.querySelector('video');
    const image = figure.querySelector('img');
    const media = video || image;
    if (!media) return;

    const kind = video ? 'video' : 'image';
    const src = media.getAttribute('src');
    const orientation = media.dataset.mediaOrientation || 'unknown';
    const width = Number(media.dataset.mediaWidth || media.getAttribute('width') || 0);
    const height = Number(media.dataset.mediaHeight || media.getAttribute('height') || 0);
    const labelBase = kind === 'video'
      ? (orientation === 'portrait' ? '竖屏视频' : orientation === 'landscape' ? '横屏视频' : '视频')
      : '图片';
    const label = [labelBase, width && height ? width + '×' + height : ''].filter(Boolean).join(' · ');

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'table-media-trigger';
    button.dataset.mediaSrc = src;
    button.dataset.mediaKind = kind;
    button.dataset.orientation = orientation;
    button.setAttribute('aria-label', '打开' + label);

    const preview = document.createElement('span');
    preview.className = 'table-media-preview';

    if (kind === 'image') {
      const thumb = document.createElement('img');
      thumb.src = src;
      thumb.alt = '';
      preview.appendChild(thumb);
    } else {
      const icon = document.createElement('span');
      icon.className = 'table-media-play';
      icon.innerHTML = playIcon;
      preview.appendChild(icon);
    }

    const caption = document.createElement('span');
    caption.className = 'table-media-label';
    caption.textContent = label;

    button.append(preview, caption);
    figure.replaceWith(button);
  });

  const isLocalImage = image => {
    try {
      const url = new URL(image.currentSrc || image.src, location.href);
      return url.origin === location.origin && url.pathname.includes('/library/');
    } catch {
      return false;
    }
  };

  document.querySelectorAll('.reader-content img').forEach(image => {
    if (image.closest('.table-media-trigger')) return;
    if (!isLocalImage(image)) return;
    image.dataset.readerZoomable = '1';
    image.tabIndex = 0;
    image.setAttribute('role', 'button');
    image.setAttribute('aria-label', image.alt ? '查看大图：' + image.alt : '查看大图');
  });

  document.addEventListener('click', event => {
    const trigger = event.target.closest('.table-media-trigger');
    if (trigger) {
      openMedia({ kind: trigger.dataset.mediaKind || 'video', src: trigger.dataset.mediaSrc });
      return;
    }

    const image = event.target.closest('.reader-content img[data-reader-zoomable]');
    if (image) {
      event.preventDefault();
      openMedia({ kind: 'image', src: image.currentSrc || image.src });
    }
  });

  document.addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.reader-content img[data-reader-zoomable]')) {
      event.preventDefault();
      openMedia({ kind: 'image', src: event.target.currentSrc || event.target.src });
    }
  });

  const closeDialog = () => {
    if (!dialog) return;

    if (dialogVideo) {
      dialogVideo.pause();
      dialogVideo.removeAttribute('src');
      dialogVideo.load();
      dialogVideo.hidden = true;
    }
    if (dialogImage) {
      dialogImage.removeAttribute('src');
      dialogImage.hidden = true;
    }
    if (dialog.open) dialog.close();
  };

  dialogClose?.addEventListener('click', closeDialog);
  dialog?.addEventListener('click', event => {
    if (event.target === dialog || event.target.matches('.reader-dialog-stage')) closeDialog();
  });
  dialog?.addEventListener('close', () => {
    if (dialogVideo) {
      dialogVideo.pause();
      dialogVideo.removeAttribute('src');
      dialogVideo.load();
      dialogVideo.hidden = true;
    }
    if (dialogImage) {
      dialogImage.removeAttribute('src');
      dialogImage.hidden = true;
    }
  });

  const updateProgress = () => {
    if (!progress) return;
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const value = Math.max(0, Math.min(1, scrollY / max));
    progress.style.width = (value * 100).toFixed(2) + '%';
  };

  updateProgress();
  addEventListener('scroll', updateProgress, { passive: true });
  addEventListener('resize', updateProgress, { passive: true });
})();