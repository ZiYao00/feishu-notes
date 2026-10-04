(() => {
  const root = document.documentElement;
  const body = document.body;
  const themeButtons = [...document.querySelectorAll('[data-theme-option]')];
  const themeToggle = document.querySelector('[data-theme-toggle]');
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

  const getTheme = () => localStorage.getItem('feishu-notes-theme') === 'dark' ? 'dark' : 'light';
  const applyTheme = theme => {
    const next = theme === 'dark' ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    themeButtons.forEach(button => {
      const active = button.dataset.themeOption === next;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    if (themeToggle) {
      const label = next === 'dark' ? '切换到亮色模式' : '切换到暗色模式';
      themeToggle.dataset.theme = next;
      themeToggle.setAttribute('aria-label', label);
      themeToggle.setAttribute('title', label);
      themeToggle.setAttribute('aria-pressed', next === 'dark' ? 'true' : 'false');
    }
  };
  applyTheme(getTheme());

  themeButtons.forEach(button => {
    button.addEventListener('click', () => {
      const next = button.dataset.themeOption === 'dark' ? 'dark' : 'light';
      localStorage.setItem('feishu-notes-theme', next);
      applyTheme(next);
    });
  });

  themeToggle?.addEventListener('click', () => {
    const current = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem('feishu-notes-theme', next);
    applyTheme(next);
  });

  const chapterSelect = document.querySelector('[data-chapter-select]');
  const chapterNav = document.querySelector('[data-chapter-nav]');
  const chapterSections = [...document.querySelectorAll('[data-chapter-section]')];
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;

  const targetIdFromHref = href => {
    if (!href) return '';
    try {
      const url = new URL(href, location.href);
      return url.hash ? decodeURIComponent(url.hash.slice(1)) : '';
    } catch {
      const index = String(href).indexOf('#');
      return index >= 0 ? String(href).slice(index + 1) : '';
    }
  };

  const readerTopOffset = () => {
    const topbarHeight = document.querySelector('.reader-topbar')?.getBoundingClientRect().height || 0;
    const mobileNav = document.querySelector('.chapter-mobile-nav');
    const mobileNavHeight = mobileNav && getComputedStyle(mobileNav).display !== 'none'
      ? mobileNav.getBoundingClientRect().height
      : 0;
    return topbarHeight + mobileNavHeight + 18;
  };

  const scrollToReaderTarget = (targetId, options = {}) => {
    const target = document.getElementById(targetId);
    if (!target) return false;
    const top = Math.max(0, scrollY + target.getBoundingClientRect().top - readerTopOffset());
    const distance = Math.abs(top - scrollY);
    const defaultBehavior =
      prefersReducedMotion || distance > innerHeight * 3
        ? 'auto'
        : 'smooth';
    const behavior = options.behavior || defaultBehavior;
    if (behavior === 'auto') {
      const previousScrollBehavior = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto';
      scrollTo({ top, behavior: 'auto' });
      requestAnimationFrame(() => {
        root.style.scrollBehavior = previousScrollBehavior;
      });
    } else {
      scrollTo({ top, behavior });
    }

    if (options.history !== false) {
      const nextUrl = location.pathname + location.search + '#' + targetId;
      if (options.replace) history.replaceState(null, '', nextUrl);
      else history.pushState(null, '', nextUrl);
    }
    return true;
  };

  chapterSelect?.addEventListener('change', () => {
    const targetId = targetIdFromHref(chapterSelect.value);
    if (targetId) scrollToReaderTarget(targetId);
  });

  const TOC_WIDTH_KEY = 'feishu-notes-toc-width';
  const TOC_COLLAPSED_KEY = 'feishu-notes-toc-collapsed';
  const TOC_DEFAULT = 208;
  const TOC_MIN = 160;
  const TOC_ABSOLUTE_MAX = 720;

  const maxTocWidth = () => {
    if (innerWidth < 1200) return TOC_DEFAULT;
    const styles = getComputedStyle(root);
    const pageGutter = parseFloat(styles.getPropertyValue('--reader-page-gutter')) || 18;
    const contentGutter = parseFloat(styles.getPropertyValue('--reader-content-gutter')) || 80;
    const splitterWidth = parseFloat(styles.getPropertyValue('--reader-splitter-width')) || 12;
    const minimumReadableContent = 640;
    const availableForToc =
      innerWidth - (pageGutter * 2) - splitterWidth - (contentGutter * 2) - minimumReadableContent;
    return Math.max(TOC_MIN, Math.min(TOC_ABSOLUTE_MAX, availableForToc));
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
    const link = event.target.closest('a[href*="#"]');
    if (link) {
      const targetId = targetIdFromHref(link.getAttribute('href'));
      if (targetId && scrollToReaderTarget(targetId)) {
        event.preventDefault();
        toc.querySelectorAll('a.active').forEach(item => item.classList.remove('active'));
        link.classList.add('active');
      }
      body.classList.remove('toc-open');
    }
  });

  chapterNav?.addEventListener('click', event => {
    const link = event.target.closest('a[href*="#"]');
    if (!link) return;
    const targetId = targetIdFromHref(link.getAttribute('href'));
    if (!targetId || !scrollToReaderTarget(targetId)) return;
    event.preventDefault();
  });

  const headings = [...document.querySelectorAll('.reader-content h2[id],.reader-content h3[id],.reader-content h4[id]')];
  const article = document.querySelector('.reader-article');
  const articleBlocks = article
    ? [...article.querySelectorAll(':scope > .reader-block')]
    : [...document.querySelectorAll('.reader-content .reader-block')];
  const rawCodeBlocks = [...document.querySelectorAll('.reader-block--code pre > code')];
  const longCodeCount = rawCodeBlocks.filter(code => (code.textContent || '').trim().length >= 800).length;
  const headingRatio = articleBlocks.length ? headings.length / articleBlocks.length : 0;
  const promptHeavy =
    rawCodeBlocks.length >= 4 &&
    longCodeCount >= Math.max(3, Math.ceil(rawCodeBlocks.length * 0.35));
  const explainReader = body.classList.contains('explain-chapter-reader');
  const denseNote =
    !explainReader &&
    (
      (headings.length >= 16 && headingRatio >= 0.25) ||
      (promptHeavy && headings.length >= 8)
    );

  body.classList.toggle('reader-dense-note', denseNote);
  body.classList.toggle('reader-prompt-heavy', promptHeavy);
  if (article) {
    article.dataset.readerMode = denseNote ? 'dense-note' : 'long-form';
    article.dataset.promptHeavy = promptHeavy ? '1' : '0';
  }

  const headingRoles = new Map();
  if (denseNote) {
    const technicalMarker = /https?:\/\/|\b(?:H3|V\d+|Lora|LoRA|API|GGUF|INT\d+|BF\d+|FP\d+|ComfyUI|Seedance|FastH3|Minimax|Quant|SGLang|GPU|CPU)\b|[+><=]/i;
    headings.forEach(heading => {
      const textValue = (heading.textContent || '').replace(/\s+/g, ' ').trim();
      const chineseCount = (textValue.match(/[\u3400-\u9fff]/g) || []).length;
      const latinCount = (textValue.match(/[A-Za-z]/g) || []).length;
      const longHeading = textValue.length >= 56 || (/https?:\/\//.test(textValue) && textValue.length >= 34);
      const majorHeading =
        heading.tagName === 'H2' &&
        !longHeading &&
        textValue.length <= 18 &&
        chineseCount >= 2 &&
        latinCount <= Math.max(6, chineseCount) &&
        !technicalMarker.test(textValue);

      const role = longHeading ? 'long' : majorHeading ? 'major' : 'note';
      headingRoles.set(heading.id, role);
      heading.dataset.readerHeadingRole = role;
      heading.closest('.reader-block--heading')?.classList.add('reader-heading-' + role);
    });
  } else {
    headings.forEach(heading => headingRoles.set(heading.id, 'major'));
  }

  if (tocList) {
    tocList.replaceChildren();
    for (const heading of headings) {
      const role = headingRoles.get(heading.id) || 'major';
      const link = document.createElement('a');
      link.setAttribute('href', location.pathname + location.search + '#' + heading.id);
      link.dataset.level = heading.tagName.slice(1);
      link.dataset.headingRole = role;
      link.classList.add(role === 'major' ? 'is-toc-primary' : 'is-toc-secondary');
      link.textContent = heading.textContent.trim();
      tocList.appendChild(link);
    }

    if (denseNote && headings.length > 12) {
      tocList.classList.add('is-smart-toc', 'is-primary-only');
      const tocHead = toc?.querySelector('.reader-toc-head');
      const tocTitle = tocHead?.querySelector('.reader-toc-title');
      if (tocTitle) tocTitle.textContent = '目录 · 精简';

      const scopeToggle = document.createElement('button');
      scopeToggle.type = 'button';
      scopeToggle.className = 'reader-toc-scope';
      scopeToggle.dataset.tocScopeToggle = '1';
      scopeToggle.textContent = '全部 ' + headings.length;
      scopeToggle.setAttribute('aria-pressed', 'false');
      scopeToggle.setAttribute('title', '显示全部目录项');
      tocHead?.insertBefore(scopeToggle, tocHead.querySelector('.reader-toc-collapse'));

      scopeToggle.addEventListener('click', () => {
        const showAll = tocList.classList.toggle('show-all');
        scopeToggle.textContent = showAll ? '精简' : '全部 ' + headings.length;
        scopeToggle.setAttribute('aria-pressed', showAll ? 'true' : 'false');
        scopeToggle.setAttribute('title', showAll ? '仅显示主要章节' : '显示全部目录项');
        if (tocTitle) tocTitle.textContent = showAll ? '目录 · 全部' : '目录 · 精简';
      });
    }
  }

  if (headings.length && tocList) {
    const tocLinks = [...tocList.querySelectorAll('a')];
    const links = new Map(tocLinks.map(link => [targetIdFromHref(link.getAttribute('href')), link]));

    const setActiveTocHeading = heading => {
      if (!heading?.id) return;
      for (const link of links.values()) link.classList.remove('active');

      let active = links.get(heading.id) || null;
      if (
        denseNote &&
        tocList.classList.contains('is-primary-only') &&
        !tocList.classList.contains('show-all') &&
        active?.classList.contains('is-toc-secondary')
      ) {
        const activeIndex = tocLinks.indexOf(active);
        active = [...tocLinks.slice(0, activeIndex + 1)].reverse().find(link => link.classList.contains('is-toc-primary')) || active;
      }
      active?.classList.add('active');
    };

    let tocScrollFrame = 0;
    const updateActiveToc = () => {
      tocScrollFrame = 0;
      const marker = readerTopOffset() + 24;
      let activeHeading = headings[0];
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= marker) activeHeading = heading;
        else break;
      }
      setActiveTocHeading(activeHeading);
    };

    const requestTocUpdate = () => {
      if (tocScrollFrame) return;
      tocScrollFrame = requestAnimationFrame(updateActiveToc);
    };

    addEventListener('scroll', requestTocUpdate, { passive: true });
    addEventListener('resize', requestTocUpdate, { passive: true });
    updateActiveToc();
  }

  if (chapterSections.length) {
    const chapterLinks = [...(chapterNav?.querySelectorAll('a[href*="#"]') || [])];
    const syncChapterTailSpace = () => {
      const lastSection = chapterSections[chapterSections.length - 1];
      const baseBottomPadding = innerWidth <= 700 ? 72 : 96;
      const availableBelowAnchor = Math.max(0, innerHeight - readerTopOffset());
      const required = Math.max(0, availableBelowAnchor - lastSection.getBoundingClientRect().height - baseBottomPadding);
      root.style.setProperty('--reader-chapter-tail-space', Math.ceil(required) + 'px');
    };

    syncChapterTailSpace();

    const setActiveChapter = section => {
      if (!section?.id) return;
      chapterLinks.forEach(link => {
        const active = targetIdFromHref(link.getAttribute('href')) === section.id;
        link.classList.toggle('is-active', active);
        if (active) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });

      if (chapterSelect) {
        const option = [...chapterSelect.options].find(item => targetIdFromHref(item.value) === section.id);
        if (option && chapterSelect.value !== option.value) chapterSelect.value = option.value;
      }
    };

    let chapterScrollFrame = 0;
    const updateActiveChapter = () => {
      chapterScrollFrame = 0;
      const marker = readerTopOffset() + 24;
      let active = chapterSections[0];
      for (const section of chapterSections) {
        if (section.getBoundingClientRect().top <= marker) active = section;
        else break;
      }
      setActiveChapter(active);
    };

    const requestChapterUpdate = () => {
      if (chapterScrollFrame) return;
      chapterScrollFrame = requestAnimationFrame(updateActiveChapter);
    };

    addEventListener('scroll', requestChapterUpdate, { passive: true });
    addEventListener('resize', () => {
      syncChapterTailSpace();
      requestChapterUpdate();
    }, { passive: true });
    updateActiveChapter();
  }

  const cleanBlockText = block =>
    (block?.innerText || '').replace(/\u200b/g, '').replace(/\s+/g, ' ').trim();

  document.querySelectorAll('.reader-block--text .docx-sheet-block').forEach(sheet => {
    const block = sheet.closest('.reader-block--text');
    if (!block) return;
    const fallback = document.createElement('div');
    fallback.className = 'reader-embed-fallback reader-sheet-fallback';
    fallback.dataset.embedKind = 'sheet';

    const title = document.createElement('strong');
    title.textContent = '飞书内嵌表格';
    const detail = document.createElement('span');
    detail.textContent = '当前离线归档未提取该 Sheet 的单元格数据，可从 Reader 顶部“原文”打开源文档查看。';
    fallback.append(title, detail);

    block.classList.remove('reader-block--text', 'is-empty-block');
    block.classList.add('reader-block--embed');
    block.replaceChildren(fallback);
  });

  document.querySelectorAll('.reader-block--text').forEach(block => {
    const hasMeaningfulContent = Boolean(
      block.querySelector('img,video,table,figure,.reader-embed-fallback,.docx-sheet-block,.sheet-block-container')
    );
    block.classList.toggle('is-empty-block', !cleanBlockText(block) && !hasMeaningfulContent);
  });

  if (denseNote && article) {
    const directBlocks = [...article.querySelectorAll(':scope > .reader-block')];
    const commentaryRuns = [];
    let currentRun = [];

    const commentaryCandidate = block => {
      if (block.classList.contains('is-empty-block')) return 'empty';
      if (block.classList.contains('reader-block--heading')) {
        if (block.querySelector('img,video,figure,.reader-heading-media')) return false;
        const heading = block.querySelector('h2,h3,h4');
        const role = heading?.dataset.readerHeadingRole || '';
        const textValue = cleanBlockText(block);
        if (!textValue || !['note', 'long'].includes(role)) return false;
        if (role === 'note') return textValue.length <= 220;
        return textValue.length <= 900;
      }
      if (block.classList.contains('reader-block--text')) {
        if (block.querySelector('img,video,table,figure,.reader-embed-fallback')) return false;
        const textValue = cleanBlockText(block);
        return Boolean(textValue && textValue.length <= 220);
      }
      return false;
    };

    const flushCommentaryRun = () => {
      const items = currentRun.filter(block => !block.classList.contains('is-empty-block'));
      const headingCount = items.filter(block => block.classList.contains('reader-block--heading')).length;
      if (items.length >= 4 && headingCount >= 3) commentaryRuns.push(items);
      currentRun = [];
    };

    directBlocks.forEach(block => {
      const candidate = commentaryCandidate(block);
      if (candidate === 'empty') return;
      if (candidate) {
        currentRun.push(block);
        return;
      }
      flushCommentaryRun();
    });
    flushCommentaryRun();

    commentaryRuns.forEach((run, runIndex) => {
      run.forEach((block, index) => {
        block.classList.add('reader-commentary-item');
        block.dataset.commentaryPosition =
          index === 0 ? 'start' : index === run.length - 1 ? 'end' : 'middle';
        block.dataset.commentaryRun = String(runIndex + 1);
      });

      if (runIndex === 0) {
        const label = document.createElement('div');
        label.className = 'reader-commentary-label';
        label.innerHTML = '<strong>讲解记录</strong><span>按原始顺序保留的现场式笔记</span>';
        run[0].before(label);
      }
    });

    body.classList.toggle('reader-commentary-note', commentaryRuns.length > 0);
    if (article) article.dataset.commentaryRuns = String(commentaryRuns.length);
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

  const labelValueText = block => {
    if (block?.classList.contains('reader-block--list')) {
      return (block.querySelector('.reader-list-content')?.textContent || cleanBlockText(block)).trim();
    }
    return cleanBlockText(block).replace(/^[•·●◦▪-]\s*/, '');
  };

  const enhanceKeyValueBlock = block => {
    if (!block?.matches('.reader-block--text,.reader-block--list')) return false;
    if (block.querySelector('a, img, video, table')) return false;
    const text = labelValueText(block);
    const match =
      text.match(/^([^：:]{1,12})[：:]\s*(.+)$/) ||
      text.match(/^(代表素材|素材)\s+(.+)$/);
    if (!match) return false;

    const key = match[1].trim();
    const value = match[2].trim();
    block.classList.add('reader-kv-row');
    if (/^[「『“"]/.test(value) || /完整原文|原文|Hook/i.test(key)) block.classList.add('is-quote-row');
    if (/为什么强|核心结论|关键结论|结论/.test(key)) block.classList.add('is-insight-row');

    const keyNode = document.createElement('div');
    keyNode.className = 'reader-kv-key';
    keyNode.textContent = key;

    const valueNode = document.createElement('div');
    valueNode.className = 'reader-kv-value';

    if (/(机制|标签|关键词)/.test(key) && /[＋+]/.test(value)) {
      const chips = document.createElement('div');
      chips.className = 'reader-chip-list';
      for (const part of value.split(/[＋+]/).map(item => item.trim()).filter(Boolean)) {
        const chip = document.createElement('span');
        chip.className = 'reader-chip';
        chip.textContent = part;
        chips.appendChild(chip);
      }
      valueNode.appendChild(chips);
    } else {
      valueNode.textContent = value;
    }

    block.replaceChildren(keyNode, valueNode);
    return true;
  };

  const parseIndentedBulletLines = text =>
    String(text || '')
      .split(/\r?\n/)
      .map(line => {
        const match = line.match(/^(\s*)[-*•]\s+(.+?)\s*$/);
        return match
          ? { indent: match[1].replace(/\t/g, '  ').length, text: match[2].trim() }
          : null;
      })
      .filter(Boolean);

  const numberedStepMatch = value =>
    String(value || '').match(/^([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]|\d{1,2}[.、)])\s*(.+)$/);

  const parseFlowCode = text => {
    const bullets = parseIndentedBulletLines(text);
    if (bullets.length < 4) return null;

    const rootItem = bullets[0];
    const numbered = bullets
      .map((item, index) => ({ item, index, match: numberedStepMatch(item.text) }))
      .filter(entry => entry.match);
    if (numbered.length < 3) return null;

    const stepIndent = Math.min(...numbered.map(entry => entry.item.indent));
    const stepEntries = numbered.filter(entry => entry.item.indent === stepIndent);
    if (stepEntries.length < 3) return null;

    const steps = stepEntries.map((entry, stepIndex) => {
      const next = stepEntries[stepIndex + 1];
      const details = bullets
        .slice(entry.index + 1, next ? next.index : bullets.length)
        .filter(item => item.indent > stepIndent)
        .map(item => item.text);
      return {
        title: entry.match[2].trim(),
        details,
      };
    });

    return {
      title: rootItem.indent < stepIndent ? rootItem.text : '流程',
      steps,
    };
  };

  const tierTone = title => {
    if (/低|避坑|不做|淘汰|谨慎/.test(title)) return 'danger';
    if (/中|择优|观察|可选/.test(title)) return 'warning';
    return 'success';
  };

  const parseTierCode = text => {
    const bullets = parseIndentedBulletLines(text);
    if (bullets.length < 5) return null;
    const rootItem = bullets[0];

    const candidates = bullets
      .map((item, index) => ({ item, index, next: bullets[index + 1] }))
      .filter(entry =>
        entry.index > 0 &&
        entry.next &&
        entry.item.indent > rootItem.indent &&
        entry.next.indent > entry.item.indent &&
        !numberedStepMatch(entry.item.text)
      );
    if (candidates.length < 2) return null;

    const groupIndent = Math.min(...candidates.map(entry => entry.item.indent));
    const groups = candidates.filter(entry => entry.item.indent === groupIndent);
    if (groups.length < 2) return null;

    const semanticGroups = groups.filter(entry =>
      /高|中|低|必做|择优|避坑|优先|推荐|谨慎|不做|淘汰/.test(entry.item.text)
    );
    if (semanticGroups.length < 2) return null;

    return {
      title: rootItem.indent < groupIndent ? rootItem.text : '分层',
      groups: groups.map((entry, groupIndex) => {
        const next = groups[groupIndex + 1];
        return {
          title: entry.item.text,
          tone: tierTone(entry.item.text),
          items: bullets
            .slice(entry.index + 1, next ? next.index : bullets.length)
            .filter(item => item.indent > groupIndent)
            .map(item => item.text),
        };
      }),
    };
  };

  const renderFlowCode = data => {
    const section = document.createElement('section');
    section.className = 'reader-structured reader-structured--flow';
    section.style.setProperty('--reader-flow-count', String(data.steps.length));

    const title = document.createElement('div');
    title.className = 'reader-structured-title';
    title.textContent = data.title;

    const track = document.createElement('div');
    track.className = 'reader-structured-flow-track';
    data.steps.forEach((step, index) => {
      const item = document.createElement('article');
      item.className = 'reader-structured-flow-step';

      const number = document.createElement('span');
      number.className = 'reader-structured-flow-number';
      number.textContent = String(index + 1).padStart(2, '0');

      const copy = document.createElement('div');
      copy.className = 'reader-structured-flow-copy';
      const heading = document.createElement('strong');
      heading.textContent = step.title;
      copy.appendChild(heading);

      if (step.details.length) {
        const list = document.createElement('ul');
        step.details.forEach(detail => {
          const row = document.createElement('li');
          row.textContent = detail;
          list.appendChild(row);
        });
        copy.appendChild(list);
      }

      item.append(number, copy);
      track.appendChild(item);
    });

    section.append(title, track);
    return section;
  };

  const splitTierItem = value => {
    const colon = String(value || '').match(/^([^：:]{1,28})[：:]\s*(.+)$/);
    if (!colon) return { label: value, metric: '', detail: '' };
    const label = colon[1].trim();
    const remainder = colon[2].trim();
    const arrow = remainder.split(/\s*[→⇒]\s*/, 2);
    const metricCandidate = arrow[0]?.trim() || '';
    const metric = /\d|%|≤|≥|≈|约|</.test(metricCandidate) ? metricCandidate : '';
    return {
      label,
      metric,
      detail: metric ? (arrow[1] || '') : remainder,
    };
  };

  const renderTierCode = data => {
    const section = document.createElement('section');
    section.className = 'reader-structured reader-structured--tier';

    const title = document.createElement('div');
    title.className = 'reader-structured-title';
    title.textContent = data.title;

    const stack = document.createElement('div');
    stack.className = 'reader-tier-stack';
    data.groups.forEach(group => {
      const groupNode = document.createElement('section');
      groupNode.className = 'reader-tier-group';
      groupNode.dataset.tone = group.tone;

      const heading = document.createElement('div');
      heading.className = 'reader-tier-heading';
      heading.textContent = group.title;

      const items = document.createElement('div');
      items.className = 'reader-tier-items';
      group.items.forEach(value => {
        const parsed = splitTierItem(value);
        const item = document.createElement('article');
        item.className = 'reader-tier-item';

        const label = document.createElement('strong');
        label.textContent = parsed.label;
        item.appendChild(label);

        if (parsed.metric) {
          const metric = document.createElement('span');
          metric.className = 'reader-tier-metric';
          metric.textContent = parsed.metric;
          item.appendChild(metric);
        }

        if (parsed.detail) {
          const detail = document.createElement('p');
          detail.textContent = parsed.detail;
          item.appendChild(detail);
        }

        items.appendChild(item);
      });

      groupNode.append(heading, items);
      stack.appendChild(groupNode);
    });

    section.append(title, stack);
    return section;
  };

  document.querySelectorAll('.reader-block--code pre > code').forEach(code => {
    const block = code.closest('.reader-block--code');
    const pre = code.parentElement;
    if (!block || !pre) return;
    const text = code.textContent || '';
    const flow = parseFlowCode(text);
    const tier = flow ? null : parseTierCode(text);
    const replacement = flow ? renderFlowCode(flow) : tier ? renderTierCode(tier) : null;
    if (!replacement) return;

    block.classList.add('is-structured-code', flow ? 'is-structured-flow' : 'is-structured-tier');
    pre.replaceWith(replacement);
  });

  const copyPlainText = async value => {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch {
        // Fall through to the legacy copy path.
      }
    }

    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }
    textarea.remove();
    return copied;
  };

  if (promptHeavy || body.classList.contains('explain-chapter-reader')) {
    const explainChapter = body.classList.contains('explain-chapter-reader');
    const promptSignal = /integrated_multimodal_description|subject_definitions|overall_soundscape|non_diegetic_music|retention_analysis|detailed_description|\[Shot\s*\d+\]|<Picture\s*\d+>|<Subject\s*\d+>/i;

    if (explainChapter) {
      document.querySelectorAll('.learning-case[data-prompt-case="1"]').forEach(caseNode => {
        const candidate = caseNode.nextElementSibling;
        if (candidate?.classList.contains('reader-block--code')) candidate.classList.add('is-case-prompt-source');
      });
    }

    document.querySelectorAll('.reader-block--code pre > code').forEach((code, index) => {
      const block = code.closest('.reader-block--code');
      const pre = code.parentElement;
      if (!block || !pre || block.classList.contains('is-structured-code')) return;

      const rawText = code.textContent || '';
      const textValue = rawText.trim();
      const minimumLength = explainChapter ? 280 : 500;
      const forcedCasePrompt = block.classList.contains('is-case-prompt-source');
      if (!forcedCasePrompt && textValue.length < minimumLength && !promptSignal.test(textValue)) return;

      const lines = rawText.split(/\r?\n/).length;
      const collapsible = textValue.length >= 900 || lines >= 18;
      block.classList.add('reader-prompt-card');
      if (collapsible) block.classList.add('is-collapsible', 'is-collapsed');
      block.dataset.promptIndex = String(index + 1);
      pre.classList.add('reader-prompt-body');

      const header = document.createElement('div');
      header.className = 'reader-prompt-head';

      const identity = document.createElement('div');
      identity.className = 'reader-prompt-identity';
      const label = document.createElement('strong');
      label.textContent = 'Prompt';
      const meta = document.createElement('span');
      meta.textContent = textValue.length.toLocaleString() + ' 字符 · ' + lines + ' 行';
      identity.append(label, meta);

      const actions = document.createElement('div');
      actions.className = 'reader-prompt-actions';

      const copyButton = document.createElement('button');
      copyButton.type = 'button';
      copyButton.className = 'reader-prompt-action';
      copyButton.textContent = '复制';
      copyButton.setAttribute('aria-label', '复制完整 Prompt');
      copyButton.addEventListener('click', async () => {
        const copied = await copyPlainText(rawText);
        const previous = copyButton.textContent;
        copyButton.textContent = copied ? '已复制' : '复制失败';
        copyButton.classList.toggle('is-success', copied);
        setTimeout(() => {
          copyButton.textContent = previous;
          copyButton.classList.remove('is-success');
        }, 1400);
      });
      actions.appendChild(copyButton);

      if (collapsible) {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'reader-prompt-action reader-prompt-toggle';
        toggle.textContent = '展开全文';
        toggle.setAttribute('aria-expanded', 'false');
        toggle.addEventListener('click', () => {
          const collapsed = block.classList.toggle('is-collapsed');
          toggle.textContent = collapsed ? '展开全文' : '收起';
          toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        });
        actions.appendChild(toggle);
      }

      header.append(identity, actions);
      block.insertBefore(header, pre);
    });

    if (explainChapter) {
      document.querySelectorAll('.learning-case[data-prompt-case="1"]').forEach(caseNode => {
        const promptBlock = caseNode.nextElementSibling;
        if (!promptBlock?.classList.contains('reader-prompt-card')) return;
        promptBlock.classList.add('reader-prompt-card--embedded');
        const promptLabel = promptBlock.querySelector('.reader-prompt-identity strong');
        if (promptLabel) promptLabel.textContent = '完整 Prompt';
        caseNode.appendChild(promptBlock);
      });
    }
  }

  const h3Blocks = [...document.querySelectorAll('.reader-block--heading')]
    .filter(block => block.querySelector('h3'));

  for (const h3Block of h3Blocks) {
    const chunks = [];
    let cursor = h3Block.nextElementSibling;

    while (cursor && !cursor.querySelector('h2,h3')) {
      if (cursor.querySelector('h4')) {
        const chunk = [cursor];
        let next = cursor.nextElementSibling;
        while (next && !next.querySelector('h2,h3,h4')) {
          chunk.push(next);
          next = next.nextElementSibling;
        }
        chunks.push(chunk);
        cursor = next;
      } else {
        cursor = cursor.nextElementSibling;
      }
    }

    if (chunks.length < 3) continue;
    const structuredCount = chunks.filter(chunk =>
      chunk.filter(block =>
        block.matches('.reader-block--text,.reader-block--list') &&
        (
          /^([^：:]{1,12})[：:]\s*(.+)$/.test(labelValueText(block)) ||
          /^(代表素材|素材)\s+(.+)$/.test(labelValueText(block))
        )
      ).length >= 2
    ).length;
    if (structuredCount < Math.ceil(chunks.length / 2)) continue;

    chunks.forEach((chunk, index) => {
      const first = chunk[0];
      if (!first?.parentElement) return;

      const wrapper = document.createElement('section');
      wrapper.className = 'reader-case-study';
      wrapper.dataset.caseIndex = String(index + 1).padStart(2, '0');
      first.parentElement.insertBefore(wrapper, first);

      const bodyNode = document.createElement('div');
      bodyNode.className = 'reader-case-body';
      const details = document.createElement('div');
      details.className = 'reader-case-details';
      const media = document.createElement('div');
      media.className = 'reader-case-media';

      wrapper.appendChild(first);

      for (const block of chunk.slice(1)) {
        const attachedMedia = [...block.querySelectorAll(':scope > .reader-media--standalone')];
        attachedMedia.forEach(item => media.appendChild(item));

        if (block.classList.contains('reader-block--media')) {
          block.remove();
          continue;
        }

        enhanceKeyValueBlock(block);
        details.appendChild(block);
      }

      bodyNode.appendChild(details);
      if (media.childElementCount) bodyNode.appendChild(media);
      else bodyNode.classList.add('is-text-only');
      wrapper.appendChild(bodyNode);
    });
  }

  const percentCellPattern = /^(?:约|不足|超过|低于|高于|至多|至少|≈|~|≤|≥|<|>)?\s*(\d+(?:\.\d+)?)%\s*(?:[（(][^()（）\r\n]{0,16}[)）])?$/;
  const numericCellPattern = /^[≈~约≤≥<>]?\s*[+-]?[\d,.]+(?:\s*[-–~]\s*[\d,.]+)?(?:%|万|亿|条|秒|s|元|岁|年|次|瓶|个)?$/i;
  const statusCellPattern = /^(?:[★☆]{1,5}(?:\s*.{0,8})?|主导|辅助|高频穿插|几乎不做|高|中|低|必做|择优(?:做)?|避坑|主力)$/;
  const statusToneFor = value => {
    if (/几乎不做|避坑|低/.test(value)) return 'danger';
    if (/辅助|中|择优/.test(value)) return 'warning';
    if (/主导|主力|必做|高|★★★★★/.test(value)) return 'success';
    return 'neutral';
  };

  document.querySelectorAll('.reader-table-wrap table').forEach(table => {
    table.classList.add('reader-smart-table');
    const allRows = [...table.rows];
    if (!allRows.length) return;

    let headerRow = table.tHead?.rows?.[0] || null;
    if (!headerRow && allRows.length > 1) {
      headerRow = allRows[0];
      headerRow.classList.add('reader-table-head-row', 'is-inferred');
      [...headerRow.cells].forEach(cell => {
        cell.classList.add('reader-table-head-cell');
        cell.setAttribute('role', 'columnheader');
      });
    } else if (headerRow) {
      headerRow.classList.add('reader-table-head-row');
    }

    const rows = allRows.filter(row => row !== headerRow);
    const headerLabels = headerRow
      ? [...headerRow.cells].map((cell, index) => cell.textContent.trim() || ('第' + (index + 1) + '列'))
      : [];
    const maxColumns = Math.max(...allRows.map(row => row.cells.length));

    for (let column = 0; column < maxColumns; column += 1) {
      const cells = rows
        .map(row => row.cells[column])
        .filter(Boolean);
      const headerCell = headerRow?.cells?.[column] || null;
      const columnCells = [headerCell, ...cells].filter(Boolean);
      const dataTexts = cells.map(cell => cell.textContent.trim()).filter(Boolean);
      const mediaCount = cells.filter(cell => cell.querySelector('.reader-media--table-cell,.table-media-trigger')).length;
      const percentCount = dataTexts.filter(value => percentCellPattern.test(value)).length;
      const numericCount = dataTexts.filter(value => numericCellPattern.test(value)).length;
      const statusCount = dataTexts.filter(value => statusCellPattern.test(value)).length;
      const averageLength = dataTexts.length
        ? dataTexts.reduce((sum, value) => sum + value.length, 0) / dataTexts.length
        : 0;
      const threshold = Math.max(1, Math.ceil(dataTexts.length * 0.6));
      let kind = 'default';
      if (mediaCount >= Math.max(1, Math.ceil(cells.length * 0.5))) kind = 'media';
      else if (percentCount >= threshold) kind = 'percent';
      else if (numericCount >= threshold) kind = 'numeric';
      else if (statusCount >= threshold) kind = 'status';
      else if (averageLength >= 18) kind = 'long';
      else if (column === 0) kind = 'label';

      columnCells.forEach(cell => {
        cell.classList.add('reader-col-' + kind);
        cell.dataset.columnKind = kind;
      });

      cells.forEach(cell => {
        const label = headerLabels[column] || ('第' + (column + 1) + '列');
        cell.dataset.label = label;
      });

      if (kind === 'status') {
        cells.forEach(cell => {
          const value = cell.textContent.trim();
          if (!value || cell.childElementCount) return;
          const chip = document.createElement('span');
          chip.className = 'reader-cell-chip';
          chip.dataset.tone = statusToneFor(value);
          chip.textContent = value;
          cell.replaceChildren(chip);
        });
      }

      const percentages = cells
        .map(cell => {
          const match = cell.textContent.trim().match(percentCellPattern);
          return match ? { cell, value: Math.min(100, Number(match[1])) } : null;
        })
        .filter(Boolean);

      if (percentages.length >= Math.max(2, Math.ceil(cells.length * 0.6))) {
        percentages.forEach(({ cell, value }) => {
          cell.classList.add('reader-percent-cell');
          cell.style.setProperty('--reader-percent', value + '%');
        });
      }
    }

    rows.forEach(row => {
      const first = row.cells[0]?.textContent.trim() || '';
      if (first.startsWith('❌')) row.classList.add('is-warning-row');
    });
  });

  const tableLayoutCache = new WeakMap();
  const generatedTableColgroup = table =>
    table.querySelector('colgroup[data-reader-autofit="1"]');

  const clearGeneratedTableLayout = table => {
    generatedTableColgroup(table)?.remove();
    table.classList.remove('reader-table-layout--natural', 'reader-table-layout--clamped', 'reader-table-layout--native');
    table.style.removeProperty('width');
    table.style.removeProperty('max-width');
    table.style.removeProperty('table-layout');

    const wrap = table.closest('.reader-table-wrap');
    if (!wrap) return;
    wrap.classList.remove('reader-table-wrap--natural', 'reader-table-wrap--clamped', 'reader-table-wrap--native', 'is-measuring-table');
    wrap.style.removeProperty('width');
    wrap.style.removeProperty('max-width');
    delete wrap.dataset.tableLayout;
    delete wrap.dataset.preferredWidth;
  };

  const measureCellContentWidth = cell => {
    if (!cell) return 56;
    const range = document.createRange();
    range.selectNodeContents(cell);
    const contentWidth = range.getBoundingClientRect().width;
    const styles = getComputedStyle(cell);
    const horizontalChrome =
      (parseFloat(styles.paddingLeft) || 0) +
      (parseFloat(styles.paddingRight) || 0) +
      (parseFloat(styles.borderLeftWidth) || 0) +
      (parseFloat(styles.borderRightWidth) || 0);
    return Math.ceil(contentWidth + horizontalChrome);
  };

  const measureTableColumns = table => {
    const wrap = table.closest('.reader-table-wrap');
    if (!wrap) return null;

    const allRows = [...table.rows];
    if (!allRows.length) return null;

    const hasSpans = allRows.some(row =>
      [...row.cells].some(cell => Number(cell.colSpan || 1) > 1 || Number(cell.rowSpan || 1) > 1)
    );
    const hasSourceColgroup = Boolean(table.querySelector('colgroup:not([data-reader-autofit="1"])'));
    if (hasSpans || hasSourceColgroup) {
      return { native: true };
    }

    generatedTableColgroup(table)?.remove();
    wrap.classList.add('is-measuring-table');
    wrap.style.width = '100%';
    wrap.style.maxWidth = '100%';
    table.style.width = 'max-content';
    table.style.maxWidth = 'none';
    table.style.tableLayout = 'auto';

    const columnCount = Math.max(...allRows.map(row => row.cells.length));
    const preferredWidths = Array.from({ length: columnCount }, (_, column) => {
      const sample = allRows.find(row => row.cells[column])?.cells[column] || null;
      return sample ? Math.ceil(sample.getBoundingClientRect().width) : 56;
    });
    const headerRow =
      table.tHead?.rows?.[0] ||
      allRows.find(row => row.classList.contains('reader-table-head-row')) ||
      allRows[0];
    const minimumWidths = preferredWidths.map((preferred, column) => {
      const headerCell =
        headerRow?.cells?.[column] ||
        allRows.find(row => row.cells[column])?.cells[column] ||
        null;
      return Math.max(56, Math.min(preferred, measureCellContentWidth(headerCell)));
    });

    wrap.classList.remove('is-measuring-table');

    const measurement = {
      native: false,
      preferredWidths,
      minimumWidths,
      preferredWidth: Math.ceil(preferredWidths.reduce((sum, width) => sum + width, 0)),
    };
    tableLayoutCache.set(table, measurement);
    return measurement;
  };

  const normalizeColumnWidths = (widths, targetWidth) => {
    const total = widths.reduce((sum, width) => sum + width, 0);
    if (!widths.length || total <= 0) return widths;
    const normalized = widths.map(width => width * targetWidth / total);
    const normalizedTotal = normalized.reduce((sum, width) => sum + width, 0);
    normalized[normalized.length - 1] += targetWidth - normalizedTotal;
    return normalized;
  };

  const layoutSmartTable = table => {
    const wrap = table.closest('.reader-table-wrap');
    if (!wrap) return;

    if (innerWidth <= 900) {
      clearGeneratedTableLayout(table);
      wrap.dataset.tableLayout = 'card';
      return;
    }

    let measurement = tableLayoutCache.get(table);
    if (!measurement) measurement = measureTableColumns(table);
    if (!measurement) return;

    const parentWidth = Math.floor(wrap.parentElement?.clientWidth || wrap.clientWidth || 0);
    const wrapStyles = getComputedStyle(wrap);
    const wrapChrome =
      (parseFloat(wrapStyles.paddingLeft) || 0) +
      (parseFloat(wrapStyles.paddingRight) || 0) +
      (parseFloat(wrapStyles.borderLeftWidth) || 0) +
      (parseFloat(wrapStyles.borderRightWidth) || 0);
    const availableWidth = Math.max(0, parentWidth - wrapChrome);

    generatedTableColgroup(table)?.remove();
    table.classList.remove('reader-table-layout--natural', 'reader-table-layout--clamped', 'reader-table-layout--native');
    wrap.classList.remove('reader-table-wrap--natural', 'reader-table-wrap--clamped', 'reader-table-wrap--native');

    if (measurement.native || !availableWidth) {
      wrap.classList.add('reader-table-wrap--native');
      table.classList.add('reader-table-layout--native');
      wrap.dataset.tableLayout = 'native';
      wrap.style.width = 'fit-content';
      wrap.style.maxWidth = '100%';
      table.style.width = 'auto';
      table.style.maxWidth = '100%';
      table.style.tableLayout = 'auto';
      return;
    }

    wrap.dataset.preferredWidth = String(measurement.preferredWidth);

    if (measurement.preferredWidth <= availableWidth) {
      const outerWidth = Math.min(parentWidth, measurement.preferredWidth + wrapChrome);
      wrap.classList.add('reader-table-wrap--natural');
      table.classList.add('reader-table-layout--natural');
      wrap.dataset.tableLayout = 'natural';
      wrap.style.width = Math.ceil(outerWidth) + 'px';
      wrap.style.maxWidth = '100%';
      table.style.width = measurement.preferredWidth + 'px';
      table.style.maxWidth = '100%';
      table.style.tableLayout = 'auto';
      return;
    }

    const minimumTotal = measurement.minimumWidths.reduce((sum, width) => sum + width, 0);
    let widths;
    if (minimumTotal >= availableWidth) {
      widths = normalizeColumnWidths(measurement.minimumWidths, availableWidth);
    } else {
      const flexibleWidths = measurement.preferredWidths.map((width, index) =>
        Math.max(0, width - measurement.minimumWidths[index])
      );
      const flexibleTotal = flexibleWidths.reduce((sum, width) => sum + width, 0);
      const remaining = availableWidth - minimumTotal;
      widths = measurement.minimumWidths.map((minimum, index) =>
        minimum + (flexibleTotal > 0 ? remaining * flexibleWidths[index] / flexibleTotal : remaining / measurement.minimumWidths.length)
      );
      widths = normalizeColumnWidths(widths, availableWidth);
    }

    const colgroup = document.createElement('colgroup');
    colgroup.dataset.readerAutofit = '1';
    widths.forEach(width => {
      const col = document.createElement('col');
      col.style.width = width.toFixed(2) + 'px';
      colgroup.appendChild(col);
    });
    table.prepend(colgroup);

    wrap.classList.add('reader-table-wrap--clamped');
    table.classList.add('reader-table-layout--clamped');
    wrap.dataset.tableLayout = 'clamped';
    wrap.style.width = parentWidth + 'px';
    wrap.style.maxWidth = '100%';
    table.style.width = availableWidth + 'px';
    table.style.maxWidth = '100%';
    table.style.tableLayout = 'fixed';
  };

  const layoutSmartTables = () => {
    document.querySelectorAll('.reader-table-wrap table.reader-smart-table').forEach(layoutSmartTable);
  };

  let tableLayoutFrame = 0;
  const scheduleTableLayout = () => {
    if (tableLayoutFrame) cancelAnimationFrame(tableLayoutFrame);
    tableLayoutFrame = requestAnimationFrame(() => {
      tableLayoutFrame = 0;
      layoutSmartTables();
    });
  };

  const playIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l10-6.5z"/></svg>';

  let lastMediaTrigger = null;

  const resetDialogMedia = () => {
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
  };

  const openMedia = ({ kind, src, opener = null }) => {
    if (!dialog || !src) return;

    resetDialogMedia();
    lastMediaTrigger = opener instanceof HTMLElement ? opener : null;

    if (kind === 'image' && dialogImage) {
      dialogImage.src = src;
      dialogImage.hidden = false;
    } else if (dialogVideo) {
      dialogVideo.src = src;
      dialogVideo.hidden = false;
      dialogVideo.load();
    }

    dialog.showModal();
    if (kind !== 'image' && dialogVideo) {
      const playPromise = dialogVideo.play();
      if (playPromise?.catch) playPromise.catch(() => {});
    }
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
    button.className = 'table-media-trigger table-media-trigger--' + kind;
    button.dataset.mediaSrc = src;
    button.dataset.mediaKind = kind;
    button.dataset.orientation = orientation;
    button.setAttribute('aria-label', '打开' + label);
    button.setAttribute('title', '打开' + label);

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
    caption.textContent = kind === 'video' ? '视频' : label;

    button.append(preview, caption);
    figure.replaceWith(button);
  });

  layoutSmartTables();

  const tableLayoutRoot = document.querySelector('.reader-main');
  if (tableLayoutRoot && 'ResizeObserver' in window) {
    let lastReaderWidth = Math.round(tableLayoutRoot.getBoundingClientRect().width);
    const tableResizeObserver = new ResizeObserver(entries => {
      const nextReaderWidth = Math.round(entries[0]?.contentRect?.width || 0);
      if (!nextReaderWidth || nextReaderWidth === lastReaderWidth) return;
      lastReaderWidth = nextReaderWidth;
      scheduleTableLayout();
    });
    tableResizeObserver.observe(tableLayoutRoot);
  }
  addEventListener('resize', scheduleTableLayout, { passive: true });

  document.querySelectorAll('.reader-media--standalone .reader-video').forEach(video => {
    const figure = video.closest('.reader-media--standalone');
    const src = video.getAttribute('src');
    if (!figure || !src) return;

    figure.classList.add('is-dialog-trigger');
    figure.dataset.mediaSrc = src;
    figure.dataset.mediaKind = 'video';
    figure.tabIndex = 0;
    figure.setAttribute('role', 'button');
    figure.setAttribute('aria-label', '打开视频并自动播放');
    video.controls = false;
    video.preload = 'metadata';
    video.tabIndex = -1;
    video.setAttribute('aria-hidden', 'true');
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
      openMedia({ kind: trigger.dataset.mediaKind || 'video', src: trigger.dataset.mediaSrc, opener: trigger });
      return;
    }

    const videoTrigger = event.target.closest('.reader-media--standalone.is-dialog-trigger');
    if (videoTrigger) {
      event.preventDefault();
      openMedia({ kind: 'video', src: videoTrigger.dataset.mediaSrc, opener: videoTrigger });
      return;
    }

    const image = event.target.closest('.reader-content img[data-reader-zoomable]');
    if (image) {
      event.preventDefault();
      openMedia({ kind: 'image', src: image.currentSrc || image.src, opener: image });
    }
  });

  document.addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.reader-media--standalone.is-dialog-trigger')) {
      event.preventDefault();
      openMedia({ kind: 'video', src: event.target.dataset.mediaSrc, opener: event.target });
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.reader-content img[data-reader-zoomable]')) {
      event.preventDefault();
      openMedia({ kind: 'image', src: event.target.currentSrc || event.target.src, opener: event.target });
    }
  });

  const closeDialog = () => {
    if (!dialog) return;
    if (dialog.open) dialog.close();
  };

  dialogClose?.addEventListener('click', closeDialog);
  dialog?.addEventListener('click', event => {
    if (event.target === dialog || event.target.matches('.reader-dialog-stage')) closeDialog();
  });
  dialog?.addEventListener('close', () => {
    resetDialogMedia();
    const focusTarget = lastMediaTrigger;
    lastMediaTrigger = null;
    if (focusTarget?.isConnected) {
      requestAnimationFrame(() => focusTarget.focus({ preventScroll: true }));
    }
  });

  const updateProgress = () => {
    if (!progress) return;
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const value = Math.max(0, Math.min(1, scrollY / max));
    progress.style.width = (value * 100).toFixed(2) + '%';
  };

  const applyLocationHash = (behavior = 'auto') => {
    const targetId = location.hash ? decodeURIComponent(location.hash.slice(1)) : '';
    if (!targetId) return;
    scrollToReaderTarget(targetId, { history: false, behavior });
  };

  updateProgress();
  addEventListener('scroll', updateProgress, { passive: true });
  addEventListener('resize', updateProgress, { passive: true });
  addEventListener('hashchange', () => applyLocationHash(prefersReducedMotion ? 'auto' : 'smooth'));
  addEventListener('popstate', () => applyLocationHash('auto'));

  if (location.hash) {
    const initialHash = location.hash;
    let initialHashSettling = true;
    const reapplyInitialHash = () => {
      if (!initialHashSettling || location.hash !== initialHash) return;
      applyLocationHash('auto');
    };
    const stopInitialHashSettling = () => {
      initialHashSettling = false;
    };

    ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach(type => {
      addEventListener(type, stopInitialHashSettling, { once: true, passive: type !== 'keydown' });
    });

    document.querySelectorAll('video[src]').forEach(video => {
      if (video.readyState >= 1) return;
      video.addEventListener('loadedmetadata', () => requestAnimationFrame(reapplyInitialHash), { once: true });
    });
    document.querySelectorAll('img[src]').forEach(image => {
      if (image.complete) return;
      image.addEventListener('load', () => requestAnimationFrame(reapplyInitialHash), { once: true });
    });

    addEventListener('load', () => requestAnimationFrame(reapplyInitialHash), { once: true });
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => requestAnimationFrame(reapplyInitialHash)).catch(() => {});
    }

    requestAnimationFrame(() => requestAnimationFrame(reapplyInitialHash));
    setTimeout(reapplyInitialHash, 400);
    setTimeout(reapplyInitialHash, 1100);
    setTimeout(() => {
      reapplyInitialHash();
      initialHashSettling = false;
    }, 2400);
  }
})();