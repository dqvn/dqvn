
/* SPA – Quản lý chương Markdown cho người học tiếng Hà Lan (A2)
 * Tác giả: Bạn & M365 Copilot
 * Tính năng:
 * - Ưu tiên dùng data/chapters.json nếu tồn tại
 * - Nếu không có, dò tự động: chapter 01.md → chapter 99.md (configurable)
 * - Giao diện hiện đại: Sidebar, TOC, tìm kiếm, đánh dấu hoàn thành, lưu tiến độ
 * - Markdown rendering: Marked + DOMPurify, highlight.js
 */

const CONFIG = {
  mediaDir: 'data/vocabularies', // thư mục chứa các file chapterXX.md
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
  tts: {
    lang: 'nl-NL',
    defaultRate: 1.0,
    defaultPitch: 1.0,
    storage: {
      voiceURI: 'a2:tts:voiceURI',
      rate: 'a2:tts:rate',
      pitch: 'a2:tts:pitch'
    }
  },
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

  // TTS controls
  ttsVoice: document.getElementById('ttsVoice'),
  ttsRate: document.getElementById('ttsRate'),
  ttsPitch: document.getElementById('ttsPitch'),
  ttsRateVal: document.getElementById('ttsRateVal'),
  ttsPitchVal: document.getElementById('ttsPitchVal'),
  ttsPlayAll: document.getElementById('ttsPlayAll'),
  ttsPause: document.getElementById('ttsPause'),
  ttsStop: document.getElementById('ttsStop'),
};

let state = {
  chapters: /** @type {{file:string,title:string}[]} */([]),
  indexLoaded: false,
  searchIndex: /** @type {{file:string,title:string,content:string}[]} */([]),
  currentIdx: -1,
  // scrolling: false, // guard for restoring scroll
  // TTS runtime
  voices: [],
  ttsQueue: [],
  ttsPlaying: false,
  ttsPaused: false,
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
  let i = 0;

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
    if (m) return m[1].trim().replace(/\*/g, '').toLowerCase().replace(/(^\s*\w|[\.\!\?]\s*\w)/g, (c) => c.toUpperCase());;
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
    item.className = `chapter-item ${isCompleted ? 'completed' : ''}`;
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

  // Gắn nút 🔊 cho MỌI câu tiếng Hà Lan (không đọc nguyên file)
  attachTTSForAllDutchSentences();
  attachTTSForWordsAndSentencesInTables1();

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
    } catch { }
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
    item.className = `chapter-item ${isCompleted ? 'completed' : ''}`;
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
  return (s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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

// ==================== TTS (Web Speech API – câu NL) ====================
function initTTS() {
  function loadVoices() {
    state.voices = window.speechSynthesis?.getVoices?.() || [];
    const nlVoices = state.voices.filter(v => (v.lang || '').toLowerCase().startsWith('nl'));
    const all = nlVoices.length ? nlVoices : state.voices;

    els.ttsVoice.innerHTML = '';
    for (const v of all) {
      const opt = document.createElement('option');
      opt.value = v.voiceURI;
      opt.textContent = `${v.name} (${v.lang})${v.default ? ' • default' : ''}`;
      els.ttsVoice.appendChild(opt);
    }

    const savedVoice = loadLS(CONFIG.tts.storage.voiceURI, null);
    if (savedVoice && [...els.ttsVoice.options].some(o => o.value === savedVoice)) {
      els.ttsVoice.value = savedVoice;
    } else {
      const firstNL = [...els.ttsVoice.options].find(o => /nl/i.test(o.textContent));
      if (firstNL) els.ttsVoice.value = firstNL.value;
    }
  }

  loadVoices();
  if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.onvoiceschanged = loadVoices;
  }

  const savedRate = loadLS(CONFIG.tts.storage.rate, CONFIG.tts.defaultRate);
  const savedPitch = loadLS(CONFIG.tts.storage.pitch, CONFIG.tts.defaultPitch);
  els.ttsRate.value = String(savedRate);
  els.ttsPitch.value = String(savedPitch);
  els.ttsRateVal.textContent = Number(savedRate).toFixed(2);
  els.ttsPitchVal.textContent = Number(savedPitch).toFixed(2);

  els.ttsVoice.addEventListener('change', () => saveLS(CONFIG.tts.storage.voiceURI, els.ttsVoice.value));
  els.ttsRate.addEventListener('input', () => {
    els.ttsRateVal.textContent = Number(els.ttsRate.value).toFixed(2);
    saveLS(CONFIG.tts.storage.rate, Number(els.ttsRate.value));
  });
  els.ttsPitch.addEventListener('input', () => {
    els.ttsPitchVal.textContent = Number(els.ttsPitch.value).toFixed(2);
    saveLS(CONFIG.tts.storage.pitch, Number(els.ttsPitch.value));
  });

  els.ttsPlayAll.addEventListener('click', () => speakAllInPage());
  els.ttsPause.addEventListener('click', () => togglePause());
  els.ttsStop.addEventListener('click', () => stopSpeaking());
}
function getSelectedVoice() {
  const uri = els.ttsVoice.value;
  const byURI = state.voices.find(v => v.voiceURI === uri);
  if (byURI) return byURI;
  const nl = state.voices.find(v => (v.lang || '').toLowerCase().startsWith('nl'));
  if (nl) return nl;
  return state.voices[0] || null;
}
function utteranceFor(text, nodeForHighlight) {
  const u = new SpeechSynthesisUtterance(text);
  const v = getSelectedVoice();
  if (v) u.voice = v;
  u.lang = v?.lang || CONFIG.tts.lang;
  u.rate = Number(els.ttsRate.value || CONFIG.tts.defaultRate);
  u.pitch = Number(els.ttsPitch.value || CONFIG.tts.defaultPitch);

  u.onstart = () => {
    if (nodeForHighlight) nodeForHighlight.classList.add('speaking');
    nodeForHighlight?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    state.ttsPlaying = true;
  };
  u.onend = () => {
    if (nodeForHighlight) nodeForHighlight.classList.remove('speaking');
    if (state.ttsQueue.length) {
      const next = state.ttsQueue.shift();
      speechSynthesis.speak(next);
    } else {
      state.ttsPlaying = false; state.ttsPaused = false;
    }
  };
  u.onerror = () => {
    if (nodeForHighlight) nodeForHighlight.classList.remove('speaking');
    state.ttsPlaying = false; state.ttsPaused = false;
  };
  return u;
}
function stopSpeaking() {
  try { speechSynthesis.cancel(); } catch { }
  state.ttsQueue = [];
  state.ttsPlaying = false;
  state.ttsPaused = false;
  els.content.querySelectorAll('.speaking').forEach(el => el.classList.remove('speaking'));
}
function togglePause() {
  if (!speechSynthesis) return;
  if (speechSynthesis.speaking && !speechSynthesis.paused) {
    speechSynthesis.pause(); state.ttsPaused = true;
  } else if (speechSynthesis.paused) {
    speechSynthesis.resume(); state.ttsPaused = false;
  }
}

// === Gắn TTS cho MỌI câu NL trong trang ===
function attachTTSForAllDutchSentences() {
  stopSpeaking();

  const selectors = [
    'p', 'li', 'blockquote',
    'td', 'th',
    'h1', 'h2', 'h3', 'h4'
  ].join(',');

  const containers = els.content.querySelectorAll(selectors);
  containers.forEach(container => {
    if (container.closest('pre, code')) return;
    if (container.dataset.ttsProcessed === '1') return;
    processContainerForSentences(container);
    container.dataset.ttsProcessed = '1';
  });
}


// Hợp nhất: nếu một khối inline (strong/em/b/i/span) chứa CẢ CÂU NL,
// thì gắn 1 nút cho toàn bộ khối, xoá các nút con lẻ tẻ bên trong.
function mergeInlineSentenceButtons(container) {
  const inlineBlocks = container.querySelectorAll('strong, em, b, i, span');

  inlineBlocks.forEach(block => {
    // Bỏ qua khối nằm trong code
    if (block.closest('code, kbd, samp')) return;

    const full = (block.innerText || '').trim();
    if (!isDutchSentence(full)) return; // không phải câu NL hoàn chỉnh

    // Nếu ngay sau block đã có 1 speak-btn dành cho block, khỏi làm gì
    const next = block.nextSibling;
    if (next && next.nodeType === Node.ELEMENT_NODE && next.classList?.contains('speak-btn')) {
      return;
    }

    // Xoá các nút speak-btn nằm BÊN TRONG block (đọc mảnh)
    const innerBtns = block.querySelectorAll('.speak-btn');
    innerBtns.forEach(btn => btn.remove());

    // Xoá các wrapper .nl-sentence bên trong (giữ nguyên text, tránh lồng)
    const innerSpans = block.querySelectorAll('.nl-sentence');
    innerSpans.forEach(sp => {
      // Unwrap: thay span bằng chính textContent
      const txt = sp.textContent || '';
      sp.replaceWith(document.createTextNode(txt));
    });

    // Gắn 1 nút ngay sau khối inline để đọc TOÀN BỘ câu
    const btn = document.createElement('button');
    btn.className = 'speak-btn';
    btn.title = 'Đọc câu tiếng Hà Lan này';
    btn.setAttribute('aria-label', 'Đọc câu tiếng Hà Lan');
    btn.textContent = '🔊';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      stopSpeaking();
      const u = utteranceFor(full, block); // highlight cả khối
      speechSynthesis.speak(u);
    });

    // Chèn 1 khoảng trắng nếu cần (tránh dính chữ)
    const needsSpace = block.nextSibling && block.nextSibling.nodeType === Node.TEXT_NODE
      ? !/^\s/.test(block.nextSibling.nodeValue || '')
      : true;

    if (needsSpace) {
      block.insertAdjacentText('afterend', ' ');
      block.insertAdjacentElement('afterend', btn);
    } else {
      block.insertAdjacentElement('afterend', btn);
    }
  });
}



// Tách text node thành câu, nhận diện NL, bọc span + nút 🔊 (đã fix đơn-câu)
// + Thêm pass hợp nhất cho câu có inline markup (strong/em) để đọc trọn vẹn.
function processContainerForSentences(container) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
      const text = node.nodeValue.trim();
      if (!text) return NodeFilter.FILTER_REJECT;
      // Bỏ qua mọi text nằm trong code/kbd/samp
      if (node.parentElement && node.parentElement.closest('code, kbd, samp')) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const textNodes = [];
  let n;
  while ((n = walker.nextNode())) textNodes.push(n);

  for (const tNode of textNodes) {
    const raw = tNode.nodeValue;
    const segments = splitToSentences(raw); // [{ text, isSentence }]

    // --- Trường hợp chỉ có 1 segment (1 câu duy nhất) ---
    if (segments.length === 1) {
      const only = segments[0];
      if (!only.isSentence || !isDutchSentence(only.text.trim())) {
        continue;
      }
      const span = document.createElement('span');
      span.className = 'nl-sentence';
      span.textContent = only.text.trim();

      const btn = document.createElement('button');
      btn.className = 'speak-btn';
      btn.title = 'Đọc câu tiếng Hà Lan này';
      btn.setAttribute('aria-label', 'Đọc câu tiếng Hà Lan');
      btn.textContent = '🔊';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        stopSpeaking();
        const u = utteranceFor(span.textContent || '', span);
        speechSynthesis.speak(u);
      });

      const frag = document.createDocumentFragment();
      frag.appendChild(span);
      frag.appendChild(btn);

      const tail = raw.match(/(\s+)$/);
      if (tail) frag.appendChild(document.createTextNode(tail[1]));

      tNode.parentNode.replaceChild(frag, tNode);
      continue;
    }

    // --- Nhiều segment ---
    if (segments.length <= 1) continue;

    const frag = document.createDocumentFragment();
    for (const seg of segments) {
      const piece = seg.text;

      if (!seg.isSentence) {
        frag.appendChild(document.createTextNode(piece));
        continue;
      }

      const trimmed = piece.trim();
      if (!isDutchSentence(trimmed)) {
        frag.appendChild(document.createTextNode(piece));
        continue;
      }

      const span = document.createElement('span');
      span.className = 'nl-sentence';
      span.textContent = trimmed;

      const m = piece.match(/(\s+)$/);
      const trailingWs = m ? m[1] : '';

      const btn = document.createElement('button');
      btn.className = 'speak-btn';
      btn.title = 'Đọc câu tiếng Hà Lan này';
      btn.setAttribute('aria-label', 'Đọc câu tiếng Hà Lan');
      btn.textContent = '🔊';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        stopSpeaking();
        const u = utteranceFor(span.textContent || '', span);
        speechSynthesis.speak(u);
      });

      frag.appendChild(span);
      frag.appendChild(btn);
      if (trailingWs) frag.appendChild(document.createTextNode(trailingWs));
    }

    tNode.parentNode.replaceChild(frag, tNode);
  }

  // --- PASS BỔ SUNG: Hợp nhất câu có inline markup (strong/em/b/i/span) ---
  mergeInlineSentenceButtons(container);
}



// === NEW: Gắn TTS cho cột "Dutch Word" & "Dutch Sentence Sample" trong bảng
function attachTTSForWordsAndSentencesInTables() {
  const tables = els.content.querySelectorAll('table');
  tables.forEach(table => {
    // Xác định header (thead > th) hoặc dòng đầu của tbody là header
    const headerCells = table.querySelectorAll('thead th, tbody tr:first-child th, tbody tr:first-child td');
    if (!headerCells.length) return;

    // Tìm index cột "Dutch Word" và "Dutch Sentence Sample"
    let idxWord = -1, idxSentence = -1;

    headerCells.forEach((cell, i) => {
      const h = (cell.textContent || '').trim().toLowerCase();

      // Word
      if (idxWord < 0 && /dutch\s*word/.test(h)) idxWord = i;
      if (idxWord < 0 && /(từ|tu)\s*tiếng\s*hà\s*lan/.test(h)) idxWord = i; // hỗ trợ nhãn tiếng Việt

      // Sentence Sample
      if (idxSentence < 0 && /dutch\s*sentence\s*sample/.test(h)) idxSentence = i;
      if (idxSentence < 0 && /(ví dụ|mẫu câu|câu mẫu)/.test(h)) idxSentence = i; // hỗ trợ nhãn tiếng Việt
    });

    const hasThead = !!table.querySelector('thead');
    const rows = table.querySelectorAll('tbody tr');

    rows.forEach((tr, rowIndex) => {
      // Nếu không có thead, bỏ qua hàng đầu tiên vì là header
      if (!hasThead && rowIndex === 0) return;

      const cells = tr.querySelectorAll('td, th');

      // 1) Dutch Word
      if (idxWord >= 0 && cells[idxWord]) {
        attachSpeakForDutchWordCell(cells[idxWord]);
      }

      // 2) Dutch Sentence Sample (ô này có thể chỉ 1 câu, đảm bảo sẽ có 🔊)
      if (idxSentence >= 0 && cells[idxSentence]) {
        // Nếu bộ xử lý câu NL tổng quát chưa chạm vào ô, thì xử lý riêng
        if (cells[idxSentence].dataset.ttsProcessed !== '1') {
          processContainerForSentences(cells[idxSentence]); // tái dùng hàm tách câu NL
          cells[idxSentence].dataset.ttsProcessed = '1';
        }
      }
    });
  });
}

// === NEW: Gắn 🔊 cho ô "Dutch Word"
function attachSpeakForDutchWordCell(cell) {
  if (cell.dataset.ttsWordBound === '1') return;

  const original = (cell.textContent || '').trim();
  if (!original) return;

  const normalized = normalizeDutchHeadword(original); // "advocaat, de" -> "advocaat"
  if (!isDutchWord(normalized)) return;

  // Cách đọc tự nhiên: "advocaat, de" -> "de advocaat"
  const verbal = verbalizeDutchHeadword(original);

  // Tạo span để highlight từ khi đọc
  const span = document.createElement('span');
  span.className = 'nl-word';
  span.textContent = original; // giữ nguyên hiển thị như bảng

  // Tạo nút 🔊
  const btn = document.createElement('button');
  btn.className = 'speak-btn';
  btn.title = 'Đọc từ tiếng Hà Lan này';
  btn.setAttribute('aria-label', 'Đọc từ tiếng Hà Lan');
  btn.textContent = '🔊';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    stopSpeaking();
    const u = utteranceFor(verbal, span);
    speechSynthesis.speak(u);
  });

  // Thay nội dung cell: dùng span + nút, vẫn giữ các phần tử con khác (nếu có) bằng cách chèn khéo
  // Nếu cell chỉ là text thuần, ta thay toàn bộ; nếu cell có HTML con, ta chỉ chèn thêm mà không phá cấu trúc
  if (cell.childNodes.length === 1 && cell.childNodes[0].nodeType === Node.TEXT_NODE) {
    // Cell thuần text → thay bằng span + btn
    cell.textContent = '';
    cell.appendChild(span);
    cell.appendChild(document.createTextNode(' '));
    cell.appendChild(btn);
  } else {
    // Cell có cấu trúc → chèn span & btn vào cuối (không làm hỏng nội dung)
    // Trước tiên, tránh nhân đôi: nếu đã có nl-word trong cell, bỏ qua
    if (!cell.querySelector('.nl-word')) {
      // Chỉ thay thế text đầu tiên bằng span nếu toàn bộ đầu cell là text của 'original'
      // Bằng không, chỉ cần thêm nút nút ở cuối
      cell.appendChild(document.createTextNode(' '));
      cell.appendChild(btn);
    }
  }

  cell.dataset.ttsWordBound = '1';
}

// === NEW: Chuẩn hóa headword (bỏ ", de/het", bỏ ngoặc)
function normalizeDutchHeadword(s) {
  return (s || '')
    .replace(/\(.*?\)/g, '')            // bỏ chú thích trong ngoặc
    .replace(/\s*,\s*(de|het)\s*$/i, '')// bỏ ", de/het" ở cuối
    .replace(/\s+/g, ' ')
    .trim();
}

// === NEW: Dạng đọc tự nhiên: "advocaat, de" -> "de advocaat"
function verbalizeDutchHeadword(s) {
  const m = (s || '').trim().match(/^([^,]+)\s*,\s*(de|het)\s*$/i);
  if (m) {
    const head = m[1].trim();
    const art  = m[2].toLowerCase();
    return `${art} ${head}`;
  }
  // Nếu không có article phía sau, đọc nguyên văn
  return normalizeDutchHeadword(s || '').trim() || (s || '').trim();
}

// === NEW: Heuristic nhận diện "một từ tiếng Hà Lan" hợp lệ
function isDutchWord(word) {
  const s = (word || '').trim();
  if (!s) return false;
  // Cho phép chữ cái tiếng Hà Lan + dấu nháy/hyphen; tối thiểu 2 ký tự
  if (!/^[a-zà-ÿ’'\-]+$/i.test(s)) return false;
  if (s.length < 2) return false;
  // Tránh nội dung nhiều từ (word column kỳ vọng 1 headword)
  if (/\s/.test(s)) return false;
  return true;
}

// Tách text node thành câu, nhận diện NL, bọc span + nút 🔊
function attachTTSForWordsAndSentencesInTables1() {
  const tables = els.content.querySelectorAll('table');
  tables.forEach(table => {
    // Xác định header
    const headerCells = table.querySelectorAll('thead th, tbody tr:first-child th, tbody tr:first-child td');
    if (!headerCells.length) return;

    // Tìm index cột Word / Sentence Sample
    let idxWord = -1, idxSentence = -1;

    headerCells.forEach((cell, i) => {
      const h = (cell.textContent || '').trim().toLowerCase();

      if (idxWord < 0 && /dutch\s*word/.test(h)) idxWord = i;
      if (idxWord < 0 && /(từ|tu)\s*tiếng\s*hà\s*lan/.test(h)) idxWord = i;

      if (idxSentence < 0 && /dutch\s*sentence\s*sample/.test(h)) idxSentence = i;
      if (idxSentence < 0 && /(ví dụ|mẫu câu|câu mẫu)/.test(h)) idxSentence = i;
    });

    const hasThead = !!table.querySelector('thead');
    const rows = table.querySelectorAll('tbody tr');

    rows.forEach((tr, rowIndex) => {
      if (!hasThead && rowIndex === 0) return; // bỏ hàng header nếu không có thead

      const cells = tr.querySelectorAll('td, th');

      // 1) Dutch Word
      if (idxWord >= 0 && cells[idxWord]) {
        attachSpeakForDutchWordCell(cells[idxWord]);
      }

      // 2) Dutch Sentence Sample
      if (idxSentence >= 0 && cells[idxSentence]) {
        const cell = cells[idxSentence];

        // Nếu chưa xử lý, tiến hành tách câu + gắn nút
        if (cell.dataset.ttsProcessed !== '1') {
          processContainerForSentences(cell);
          cell.dataset.ttsProcessed = '1';
        }

        // Nếu sau khi xử lý mà vẫn chưa có câu NL nào (do heuristic),
        // nhưng bạn muốn **bắt buộc** có nút cho toàn bộ nội dung cell (vì chắc chắn là NL),
        // thì có thể fallback ép bọc toàn bộ làm 1 câu:
        if (!cell.querySelector('.nl-sentence')) {
          const text = (cell.textContent || '').trim();
          if (text) {
            const span = document.createElement('span');
            span.className = 'nl-sentence';
            span.textContent = text;

            const btn = document.createElement('button');
            btn.className = 'speak-btn';
            btn.title = 'Đọc câu tiếng Hà Lan này';
            btn.setAttribute('aria-label', 'Đọc câu tiếng Hà Lan');
            btn.textContent = '🔊';
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              stopSpeaking();
              const u = utteranceFor(span.textContent || '', span);
              speechSynthesis.speak(u);
            });

            cell.textContent = '';
            cell.appendChild(span);
            cell.appendChild(document.createTextNode(' '));
            cell.appendChild(btn);
          }
        }
      }
    });
  });
}


// Tách câu: ưu tiên Intl.Segmenter (chính xác), fallback regex
function splitToSentences(text) {
  if (!text) return [{ text, isSentence: false }];

  if ('Intl' in window && 'Segmenter' in Intl) {
    try {
      const seg = new Intl.Segmenter('nl', { granularity: 'sentence' });
      const parts = Array.from(seg.segment(text));
      return parts.map(p => ({
        text: p.segment,
        isSentence: /[\.!?…]['")\]]*\s*$/.test(p.segment.trim()) || p.isWordLike === false
      }));
    } catch { }
  }

  const out = [];
  let last = 0;
  const rx = /([\.!?…]['")\]]*\s+)/g;
  let m;
  while ((m = rx.exec(text)) !== null) {
    const end = m.index + m[0].length;
    out.push({ text: text.slice(last, end), isSentence: true });
    last = end;
  }
  if (last < text.length) out.push({ text: text.slice(last), isSentence: false });
  return out;
}

// Heuristic nhận diện câu tiếng Hà Lan
function isDutchSentence(sentence) {
  const s = (sentence || '').trim();
  if (s.length < 4) return false;
  if (!/[\.!?…]['")\]]*$/.test(s)) return false;
  if (!/\s/.test(s)) return false;

  const nl = scoreDutch(s);
  const en = scoreEnglish(s);
  return nl >= 1; // && (nl - en) >= 1;
}

function tokenizeWords(s) {
  return (s.toLowerCase().match(/[a-zà-ÿ]+/gi) || []);
}
function scoreDutch(s) {
  const words = tokenizeWords(s);
  if (!words.length) return 0;
  let score = 0;

  const NL_FUNCTION = new Set([
    'ik', 'jij', 'je', 'hij', 'zij', 'ze', 'wij', 'we', 'jullie', 'u',
    'mij', 'me', 'jou', 'hem', 'haar', 'ons', 'hun', 'hen', 'u',
    'die', 'dat', 'dit', 'deze',
    'een', 'de', 'het',
    'niet', 'geen', 'ook', 'al', 'toch', 'nog', 'wel', 'maar',
    'en', 'of', 'want', 'omdat', 'dus', 'dat', 'als', 'terwijl', 'nadat', 'voordat',
    'voor', 'naar', 'bij', 'met', 'op', 'aan', 'van', 'uit', 'over', 'onder', 'achter', 'tegen', 'door', 'tussen', 'om',
    'hier', 'daar', 'waar', 'wanneer', 'hoe', 'waarom', 'welke'
  ]);
  const NL_VERBS = new Set([
    'ben', 'bent', 'is', 'zijn', 'was', 'waren', 'geweest',
    'heb', 'hebt', 'heeft', 'hebben', 'had', 'hadden', 'gehad',
    'doe', 'doet', 'doen', 'deed', 'deden', 'gedaan',
    'zal', 'zult', 'zullen', 'zou', 'zouden',
    'kan', 'kunt', 'kunnen', 'kon', 'konden', 'gekund',
    'moet', 'moeten', 'moest', 'moesten', 'gemoeten',
    'wil', 'wilt', 'willen', 'wou', 'wouden', 'gewild',
    'mag', 'mogen', 'mocht', 'mochten', 'gemogen'
  ]);
  const NL_SUFFIX = [/en$/, /t$/, /(de|te|den|ten|dt)$/];

  for (const w of words) {
    if (NL_FUNCTION.has(w) || NL_VERBS.has(w)) score += 2;
    else if (NL_SUFFIX.some(rx => rx.test(w)) && w.length > 3) score += 1;
  }

  if (/\b(heb|hebt|heeft|hebben|ben|bent|is|zijn)\b\s+\bge[a-z]{2,}\b/i.test(s)) score += 2;
  return score;
}
function scoreEnglish(s) {
  const words = tokenizeWords(s);
  if (!words.length) return 0;
  let score = 0;
  const EN_COMMON = new Set([
    'the', 'is', 'are', 'am', 'was', 'were', 'a', 'an', 'and', 'or', 'but',
    'not', 'no', 'do', 'does', 'did', 'have', 'has', 'had',
    'will', 'would', 'can', 'could', 'should', 'shall', 'may', 'might', 'must',
    'to', 'for', 'in', 'on', 'at', 'with', 'from', 'by', 'of'
  ]);
  for (const w of words) if (EN_COMMON.has(w)) score += 1;
  return score;
}

// Đọc tất cả câu NL theo thứ tự hiển thị
// function speakAllInPage() {
//   stopSpeaking();
//   const nodes = els.content.querySelectorAll('.nl-sentence');
//   state.ttsQueue = [];
//   nodes.forEach(node => {
//     const t = (node.textContent || '').trim();
//     if (t) state.ttsQueue.push(utteranceFor(t, node));
//   });
//   if (state.ttsQueue.length) {
//     const first = state.ttsQueue.shift();
//     speechSynthesis.speak(first);
//   } else {
//     toast('Không tìm thấy câu tiếng Hà Lan trong chương này.');
//   }
// }

function speakAllInPage() {
  stopSpeaking();
  // Đọc theo thứ tự hiển thị: từ và câu
  const nodes = els.content.querySelectorAll('.nl-word, .nl-sentence');
  state.ttsQueue = [];
  nodes.forEach(node => {
    const t = (node.textContent || '').trim();
    if (!t) return;
    // Nếu là nl-word, đọc theo verbalize (xử lý ", de/het")
    let textToSpeak = t;
    if (node.classList.contains('nl-word')) {
      textToSpeak = verbalizeDutchHeadword(t);
    }
    state.ttsQueue.push(utteranceFor(textToSpeak, node));
  });

  if (state.ttsQueue.length) {
    const first = state.ttsQueue.shift();
    speechSynthesis.speak(first);
  } else {
    toast('Không tìm thấy từ/câu tiếng Hà Lan trong chương này.');
  }
}


// ---------- Bootstrap ----------
(async function init() {
  initThemeAndFont();
  initNavButtons();
  initReadingProgress();
  initSearch();
  applyListFiltersEvents();

  if ('speechSynthesis' in window && 'SpeechSynthesisUtterance' in window) {
    initTTS();
  } else {
    console.warn('Trình duyệt không hỗ trợ Web Speech API (TTS).');
    document.querySelector('.tts-bar')?.remove();
  }

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
