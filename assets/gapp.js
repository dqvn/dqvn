
/* SPA – Quản lý chương Markdown cho người học tiếng Hà Lan (A2)
 * Tác giả: Bạn & M365 Copilot
 * Tính năng:
 * - Ưu tiên dùng data/chapters.json nếu tồn tại
 * - Nếu không có, dò tự động: chapter 01.md → chapter 99.md (configurable)
 * - Giao diện hiện đại: Sidebar, TOC, tìm kiếm, đánh dấu hoàn thành, lưu tiến độ
 * - Markdown rendering: Marked + DOMPurify, highlight.js
 */

const CONFIG = {
  mediaDir: 'data',
  chapterPrefix: 'chapter ',
  chapterExt: '.md',
  pad: 2,              // "01", "02"
  maxScan: 99,         // tối đa dò 99 chương
  tocHeadings: ['H1', 'H2', 'H3', 'H4'], // headings đưa vào TOC
  completeThreshold: 0.9, // 90% cuộn => đánh dấu hoàn thành
  searchDebounce: 200, // ms
  defaultFontPx: 18,
  minFontPx: 14,
  maxFontPx: 22,
  storage: {
    lastChapter: 'a2:lastChapter',
    scrollMap: 'a2:scrollByFile',
    completed: 'a2:completedSet',
    theme: 'a2:theme',
    font: 'a2:fontPx',
    searchIndex: 'a2:searchIndexV1' // optional (cache)
  }
};

const els = {
  sidebar: document.getElementById('sidebar'),
  btnSidebar: document.getElementById('btnSidebar'),
  chapterList: document.getElementById('chapterList'),

  filterUnread: document.getElementById('filterUnread'),
  filterComplete: document.getElementById('filterComplete'),
  btnResetProgress: document.getElementById('btnResetProgress'),

  main: document.getElementById('main'),
  content: document.getElementById('content'),
  toc: document.getElementById('toc'),
  tocList: document.getElementById('tocList'),

  searchInput: document.getElementById('searchInput'),
  clearSearch: document.getElementById('clearSearch'),

  btnFontPlus: document.getElementById('btnFontPlus'),
  btnFontMinus: document.getElementById('btnFontMinus'),
  btnTheme: document.getElementById('btnTheme'),

  btnPrev: document.getElementById('btnPrev'),
  btnNext: document.getElementById('btnNext'),
  btnCopyLink: document.getElementById('btnCopyLink'),
  btnPrint: document.getElementById('btnPrint'),

  readingProgress: document.getElementById('readingProgress'),
};

let state = {
  chapters: /** @type {{file:string,title:string}[]} */([]),
  indexLoaded: false,
  searchIndex: /** @type {{file:string,title:string,content:string}[]} */([]),
  currentIdx: -1,
  scrolling: false, // guard for restoring scroll
};

// ---------- Utils ----------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const debounce = (fn, ms) => {
  let t; return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), ms);
  };
};
const padNum = (n, width) => String(n).padStart(width, '0');
const fileUrl = (n) => `${CONFIG.mediaDir}/${CONFIG.chapterPrefix}${padNum(n, CONFIG.pad)}${CONFIG.chapterExt}`;

function saveLS(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
function loadLS(key, def) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v ?? def; }
  catch { return def; }
}

// ---------- Theme & Font ----------
function initThemeAndFont() {
  // theme: 'light' | 'dark' | 'system'
  let theme = loadLS(CONFIG.storage.theme, 'system');
  document.documentElement.setAttribute('data-theme', theme);

  // font size
  let px = loadLS(CONFIG.storage.font, CONFIG.defaultFontPx);
  setContentFont(px);

  els.btnTheme.addEventListener('click', cycleTheme);
  els.btnFontPlus.addEventListener('click', () => setContentFont(Math.min(px + 1, CONFIG.maxFontPx)));
  els.btnFontMinus.addEventListener('click', () => setContentFont(Math.max(px - 1, CONFIG.minFontPx)));

  function cycleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'system';
    const next = current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system';
    document.documentElement.setAttribute('data-theme', next);
    saveLS(CONFIG.storage.theme, next);
  }
  function setContentFont(nextPx) {
    px = nextPx;
    document.documentElement.style.setProperty('--content-font', `${px}px`);
    saveLS(CONFIG.storage.font, px);
  }
}

// ---------- Chapters: load manifest or scan ----------
async function tryLoadManifest() {
  try {
    const res = await fetch(`${CONFIG.mediaDir}/chapters.json`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data)) return null;
    // normalize
    return data.map(x => ({
      file: x.file,
      title: x.title || x.file
    }));
  } catch { return null; }
}

// Dò tự động chapter 01..maxScan (song song, có throttle nhẹ)
async function scanChapters() {
  const found = [];
  const concurrency = 6;
  let i = 1;

  async function worker() {
    while (i <= CONFIG.maxScan) {
      const n = i++;
      const url = fileUrl(n);
      try {
        const res = await fetch(url, { method: 'GET', cache: 'no-store' });
        if (res.ok) {
          // đọc vài bytes đầu để suy tên (tiêu đề H1)
          const text = await res.text();
          const title = extractTitleFromMd(text) || `Chương ${padNum(n, CONFIG.pad)}`;
          found.push({ file: `${CONFIG.chapterPrefix}${padNum(n, CONFIG.pad)}${CONFIG.chapterExt}`, title });
        }
      } catch (e) { /* ignore */ }
    }
  }
  await Promise.all(new Array(concurrency).fill(0).map(worker));
  // sort by file ascending
  found.sort((a, b) => a.file.localeCompare(b.file, undefined, { numeric: true }));
  return found;
}

function extractTitleFromMd(md) {
  // Ưu tiên front-matter "title: ..." nếu có
  // Hoặc dòng đầu dạng "# Tiêu đề"
  // Rất đơn giản, không parse YAML đầy đủ
  const lines = md.split(/\r?\n/);
  if (lines.length === 0) return '';
  if (lines[0].startsWith('---')) {
    for (let k = 1; k < Math.min(lines.length, 20); k++) {
      const line = lines[k].trim();
      if (/^title\s*:\s*/i.test(line)) {
        return line.replace(/^title\s*:\s*/i, '').replace(/^["']|["']$/g, '').trim();
      }
      if (line.startsWith('---')) break;
    }
  }
  for (const line of lines) {
    const m = line.match(/^#\s+(.+)/);
    if (m) return m[1].trim().replace(/\*/g, '');
  }
  return '';
}

// ---------- Build UI ----------
function renderChapterList() {
  const completed = new Set(loadLS(CONFIG.storage.completed, []));
  const unreadOnly = els.filterUnread.checked;
  const completeOnly = els.filterComplete.checked;

  els.chapterList.innerHTML = '';
  state.chapters.forEach((ch, idx) => {
    const isCompleted = completed.has(ch.file);
    if (unreadOnly && isCompleted) return;
    if (completeOnly && !isCompleted) return;

    const item = document.createElement('div');
    item.className = `chapter-item ${isCompleted ? 'completed': ''}`;
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    item.setAttribute('aria-label', ch.title);

    const title = document.createElement('div');
    title.className = 'chapter-item__title';
    title.innerHTML = `<span class="badge">${idx + 1}</span> <span>${escapeHtml(ch.title)}</span>`;

    const meta = document.createElement('div');
    meta.className = 'chapter-item__meta';
    meta.innerHTML = `
      <span class="tag">${isCompleted ? 'Đã hoàn thành' : 'Chưa đọc'}</span>
      <span style="color: var(--muted)">Tệp: ${escapeHtml(ch.file)}</span>
    `;

    item.appendChild(title);
    item.appendChild(meta);
    item.addEventListener('click', () => openChapter(idx));
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openChapter(idx); }
    });

    els.chapterList.appendChild(item);
  });
}

function applyListFiltersEvents() {
  els.filterUnread.addEventListener('change', renderChapterList);
  els.filterComplete.addEventListener('change', renderChapterList);
  els.btnResetProgress.addEventListener('click', () => {
    if (!confirm('Xóa toàn bộ trạng thái hoàn thành & vị trí cuộn?')) return;
    saveLS(CONFIG.storage.completed, []);
    saveLS(CONFIG.storage.scrollMap, {});
    renderChapterList();
  });
}

// ---------- Open chapter ----------
async function openChapter(idx, { fromPopState = false } = {}) {
  if (idx < 0 || idx >= state.chapters.length) return;
  state.currentIdx = idx;

  const ch = state.chapters[idx];
  const url = `${CONFIG.mediaDir}/${ch.file}`;

  // Update URL (hash) cho deep-link
  if (!fromPopState) {
    history.pushState({ idx }, '', `#${encodeURIComponent(ch.file)}`);
  }

  // Tải nội dung
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    els.content.innerHTML = `<p style="color: var(--err)">Không thể tải <code>${escapeHtml(ch.file)}</code>.</p>`;
    return;
  }
  const md = await res.text();

  // Render Markdown: marked -> sanitize
  marked.setOptions({
    breaks: true,
    gfm: true,
    headerIds: true,
    mangle: false
  });
  const rawHtml = marked.parse(md);
  const safe = DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } });
  els.content.innerHTML = safe;

  // Highlight code blocks
  document.querySelectorAll('pre code').forEach(block => {
    try { hljs.highlightElement(block); } catch { /* ignore */ }
  });

  // Xây TOC theo headings
  buildTOC();

  // Lưu chapter cuối
  saveLS(CONFIG.storage.lastChapter, ch.file);

  // Phục hồi scroll nếu từng đọc
  restoreScrollPosition(ch.file);

  // Cập nhật danh sách
  renderChapterList();

  // Cập nhật nút Prev/Next
  els.btnPrev.disabled = idx <= 0;
  els.btnNext.disabled = idx >= state.chapters.length - 1;

  // Cập nhật tiêu đề trang
  document.title = `${ch.title} – Ngữ pháp NL A2`;
}

function buildTOC() {
  const headings = Array.from(els.content.querySelectorAll('h1, h2, h3, h4'));
  els.tocList.innerHTML = '';
  headings.forEach(h => {
    const level = Number(h.tagName.substring(1));
    const id = h.id || slugify(h.textContent || '');
    if (!h.id) h.id = id;

    const a = document.createElement('a');
    a.href = `#${id}`;
    a.textContent = h.textContent || '';
    a.className = `lvl-${level}`;
    a.addEventListener('click', (e) => {
      // Giữ hash chapter, chỉ scroll đến heading
      e.stopPropagation();
    });
    els.tocList.appendChild(a);
  });
}

// ---------- Progress & Completion ----------
function initReadingProgress() {
  document.addEventListener('scroll', () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const y = window.scrollY;
    const p = Math.max(0, Math.min(1, max > 0 ? y / max : 0));
    els.readingProgress.style.width = (p * 100).toFixed(2) + '%';

    // Đánh dấu hoàn thành
    const ch = getCurrentChapter();
    if (!ch) return;
    if (p >= CONFIG.completeThreshold) {
      const completed = new Set(loadLS(CONFIG.storage.completed, []));
      if (!completed.has(ch.file)) {
        completed.add(ch.file);
        saveLS(CONFIG.storage.completed, Array.from(completed));
        renderChapterList();
      }
    }

    // Lưu vị trí cuộn
    const map = loadLS(CONFIG.storage.scrollMap, {});
    map[ch.file] = y;
    saveLS(CONFIG.storage.scrollMap, map);
  }, { passive: true });
}

function restoreScrollPosition(file) {
  const map = loadLS(CONFIG.storage.scrollMap, {});
  const y = map[file] || 0;
  // tránh flicker khi nội dung còn layouting
  state.scrolling = true;
  requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'instant' }));
  setTimeout(() => { state.scrolling = false; }, 100);
}

// ---------- Search ----------
function initSearch() {
  const onSearch = debounce(async () => {
    const q = (els.searchInput.value || '').trim().toLowerCase();
    if (!q) {
      els.clearSearch.style.visibility = 'hidden';
      // trở về chương hiện tại (không thay đổi)
      renderChapterList(); // render lại list để bỏ highlight kết quả
      return;
    }
    els.clearSearch.style.visibility = 'visible';

    if (!state.indexLoaded) {
      await buildSearchIndex();
    }
    const results = searchInIndex(q);
    renderSearchResults(results, q);
  }, CONFIG.searchDebounce);

  els.searchInput.addEventListener('input', onSearch);
  els.clearSearch.addEventListener('click', () => {
    els.searchInput.value = '';
    els.clearSearch.style.visibility = 'hidden';
    renderChapterList();
  });
}
async function buildSearchIndex() {
  // Thử đọc từ cache
  const cached = loadLS(CONFIG.storage.searchIndex, null);
  if (cached && Array.isArray(cached) && cached.length) {
    state.searchIndex = cached;
    state.indexLoaded = true;
    return;
  }
  const arr = [];
  for (const ch of state.chapters) {
    try {
      const res = await fetch(`${CONFIG.mediaDir}/${ch.file}`, { cache: 'no-store' });
      if (!res.ok) continue;
      const md = await res.text();
      const text = mdToPlain(md);
      arr.push({ file: ch.file, title: ch.title, content: text });
    } catch {}
  }
  state.searchIndex = arr;
  state.indexLoaded = true;
  saveLS(CONFIG.storage.searchIndex, arr);
}

function mdToPlain(md) {
  // Loại bỏ code block & markdown syntax thô sơ để search/snippet
  return md
    .replace(/`{3}[\s\S]*?`{3}/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/[#>*_~\-]+/g, ' ')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function searchInIndex(q) {
  // Tìm kiếm đơn giản: substring
  const results = [];
  for (const row of state.searchIndex) {
    const idx = row.content.toLowerCase().indexOf(q);
    if (idx >= 0) {
      const start = Math.max(0, idx - 60);
      const end = Math.min(row.content.length, idx + q.length + 60);
      const snippet = row.content.substring(start, end);
      results.push({ file: row.file, title: row.title, snippet, idx });
    }
  }
  // Ưu tiên tiêu đề hoặc vị trí xuất hiện sớm
  results.sort((a, b) => (a.idx - b.idx) || a.title.localeCompare(b.title));
  return results;
}

function renderSearchResults(results, q) {
  // Render ngay trong sidebar, thay vì danh sách chương mặc định
  els.chapterList.innerHTML = '';
  if (!results.length) {
    const empty = document.createElement('div');
    empty.className = 'chapter-item';
    empty.innerHTML = `<div class="chapter-item__title">Không tìm thấy kết quả</div>`;
    els.chapterList.appendChild(empty);
    return;
  }
  const completed = new Set(loadLS(CONFIG.storage.completed, []));
  const rx = new RegExp(escapeRegExp(q), 'gi');

  results.forEach(r => {
    const isCompleted = completed.has(r.file);
    const item = document.createElement('div');
    item.className = `chapter-item ${isCompleted ? 'completed': ''}`;
    item.tabIndex = 0;

    const title = document.createElement('div');
    title.className = 'chapter-item__title';
    title.innerHTML = `<span>${escapeHtml(r.title)}</span>`;

    const meta = document.createElement('div');
    meta.className = 'chapter-item__meta';
    const snip = escapeHtml(r.snippet).replace(rx, m => `<span class="hl">${m}</span>`);
    meta.innerHTML = `<span class="tag">${isCompleted ? 'Đã hoàn thành' : 'Chưa đọc'}</span>
                      <span style="color:var(--muted)">… ${snip} …</span>`;

    item.appendChild(title);
    item.appendChild(meta);
    item.addEventListener('click', () => {
      const idx = state.chapters.findIndex(x => x.file === r.file);
      if (idx >= 0) openChapter(idx);
    });
    els.chapterList.appendChild(item);
  });
}

// ---------- Navigation ----------
function initNavButtons() {
  els.btnPrev.addEventListener('click', () => openChapter(state.currentIdx - 1));
  els.btnNext.addEventListener('click', () => openChapter(state.currentIdx + 1));
  els.btnCopyLink.addEventListener('click', async () => {
    const ch = getCurrentChapter();
    const url = new URL(location.href);
    if (ch) url.hash = `#${encodeURIComponent(ch.file)}`;
    try {
      await navigator.clipboard.writeText(url.toString());
      toast('Đã sao chép liên kết chương hiện tại!');
    } catch {
      prompt('Sao chép liên kết:', url.toString());
    }
  });
  els.btnPrint.addEventListener('click', () => window.print());

  // Sidebar toggle
  els.btnSidebar.addEventListener('click', () => {
    els.sidebar.classList.toggle('open');
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.key.toLowerCase() === 't') { e.preventDefault(); els.btnTheme.click(); }
    if (e.altKey && (e.key === '=' || e.key === '+')) { e.preventDefault(); els.btnFontPlus.click(); }
    if (e.altKey && e.key === '-') { e.preventDefault(); els.btnFontMinus.click(); }
    if (e.altKey && e.key.toLowerCase() === 'l') { e.preventDefault(); els.btnSidebar.click(); }
    if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); els.btnPrev.click(); }
    if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); els.btnNext.click(); }
  });

  // Popstate for back/forward
  window.addEventListener('popstate', (e) => {
    const idx = e.state?.idx;
    if (typeof idx === 'number') {
      openChapter(idx, { fromPopState: true });
    } else {
      // no state -> initial or direct hash
      handleInitialRoute();
    }
  });
}

function getCurrentChapter() {
  if (state.currentIdx < 0 || state.currentIdx >= state.chapters.length) return null;
  return state.chapters[state.currentIdx];
}

// ---------- Toast ----------
function toast(msg) {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.position = 'fixed';
  el.style.bottom = '18px';
  el.style.right = '18px';
  el.style.background = 'var(--panel)';
  el.style.border = '1px solid var(--border)';
  el.style.padding = '10px 14px';
  el.style.borderRadius = '10px';
  el.style.boxShadow = 'var(--shadow)';
  el.style.zIndex = '1000';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

// ---------- HTML helpers ----------
function slugify(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9\s-]/g, '')
    .trim().replace(/\s+/g, '-');
}
function escapeHtml(s) {
  return (s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------- Initial route ----------
function handleInitialRoute() {
  const hash = decodeURIComponent(location.hash || '').replace(/^#/, '');
  let targetIdx = -1;

  if (hash) {
    targetIdx = state.chapters.findIndex(ch => ch.file === hash);
  }
  if (targetIdx < 0) {
    const last = loadLS(CONFIG.storage.lastChapter, null);
    if (last) {
      targetIdx = state.chapters.findIndex(ch => ch.file === last);
    }
  }
  if (targetIdx < 0 && state.chapters.length) targetIdx = 0;

  if (targetIdx >= 0) openChapter(targetIdx, { fromPopState: true });
}

// ---------- Bootstrap ----------
(async function init() {
  initThemeAndFont();
  initNavButtons();
  initReadingProgress();
  initSearch();
  applyListFiltersEvents();

  // Load chapters
  let chapters = await tryLoadManifest();
  if (!chapters) {
    chapters = await scanChapters();
  }
  state.chapters = chapters;

  renderChapterList();
  handleInitialRoute();

  // Đóng sidebar khi chọn chương trên mobile
  if (window.matchMedia('(max-width: 900px)').matches) {
    document.addEventListener('click', (e) => {
      const inSidebar = e.target.closest?.('.sidebar');
      const isToggle = e.target.closest?.('#btnSidebar');
      if (!inSidebar && !isToggle) els.sidebar.classList.remove('open');
    });
  }
})();
