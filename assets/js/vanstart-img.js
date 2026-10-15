'use strict';

/* vanstart.html: shows a small picture under each Dutch word to help memory.
 * URLs come from data/images.json ({ "<dutch>": ["url", ...] }, built by
 * tools/fetch-word-images.mjs and safe to hand-edit). Words with no entry
 * simply show nothing. Tap a thumbnail to enlarge it; if a word has several
 * URLs, tapping the enlarged picture cycles through them.
 *
 * Isolated like vanstart-spell.js: it only wraps reloadTable() and touches DOM
 * it creates itself. Load it after common.js and before ttsvanstartscript.js.
 */
(function () {
  let imagesPromise = null;
  function loadImages() {
    if (!imagesPromise) imagesPromise = fetch('data/images.json').then(r => r.ok ? r.json() : {}).catch(() => ({}));
    return imagesPromise;
  }

  // data/image-hints.json: { "<dutch>": { q: "search phrase", e: "emoji" } } — only "e" is used here
  let hintsPromise = null;
  function loadHints() {
    if (!hintsPromise) hintsPromise = fetch('data/image-hints.json').then(r => r.ok ? r.json() : {}).catch(() => ({}));
    return hintsPromise;
  }

  /* ── "This picture doesn't fit the word" reports ──────────────────────────
   * One tap on ⚑ POSTs to the worker's /feedback endpoint as type "image"
   * (same inbox as the portal's feedback; the owner reviews it there). The
   * worker rate-limits per IP and keeps one report per word per day. */
  const REPORT_KEY = 'nl_img_reports';          // { "<dutch>": "<file reported>" }
  const WORKER = (typeof SYNC_WORKER_URL !== 'undefined') ? SYNC_WORKER_URL : 'https://nl-sync.itho.workers.dev';

  function reportedMap() { try { return JSON.parse(localStorage.getItem(REPORT_KEY) || '{}') || {}; } catch { return {}; } }
  function isReported(word, file) { return reportedMap()[word] === file; }
  function markReported(word, file) {
    try { const m = reportedMap(); m[word] = file; localStorage.setItem(REPORT_KEY, JSON.stringify(m)); } catch {}
  }

  let toastEl = null, toastTimer = 0;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'vs-img-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('on'), 2800);
  }

  /** @returns {Promise<boolean>} true when the report was accepted */
  async function sendReport(entry, file, kind) {
    const lesson = (() => { try { return localStorage.getItem('fc-lesson') || ''; } catch { return ''; } })();
    const english = String(entry.english || '');
    const message = `[IMG] ${entry.dutch} (${english}) · ${lesson} · ${kind === 'emoji' ? 'emoji' : file}`.slice(0, 500);
    try {
      const r = await fetch(WORKER + '/feedback', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          type: 'image',
          message,
          img: { word: entry.dutch, english, lesson, file: kind === 'emoji' ? '' : file, kind },
          env: {
            url:     location.pathname,
            browser: (navigator.userAgent || '').slice(0, 80),
            screen:  `${screen.width}×${screen.height}`,
            lang:    navigator.language || '',
          },
        }),
      });
      if (r.status === 429) { toast('Even wachten… / Please wait a moment'); return false; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      markReported(entry.dutch, file);
      toast('✅ Bedankt! Melding verstuurd / Thanks, report sent');
      return true;
    } catch {
      toast('Kon niet versturen / Could not send');
      return false;
    }
  }

  function makeReportBtn(entry, getFile, kind, extraClass) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'vs-report' + (extraClass ? ' ' + extraClass : '');
    const label = extraClass ? ' Past niet / Not relevant' : '';
    const setState = () => {
      const done = isReported(entry.dutch, getFile());
      btn.classList.toggle('done', done);
      btn.disabled = done;
      btn.textContent = (done ? '✓' : '⚑') + label;
      btn.title = done ? 'Gemeld / Reported' : 'Past niet bij het woord? Meld deze afbeelding / Not a good picture? Report it';
      btn.setAttribute('aria-label', btn.title);
    };
    setState();
    btn.addEventListener('click', async e => {
      e.stopPropagation();   // don't trigger the cell's speakText() / the viewer's close
      btn.disabled = true;
      await sendReport(entry, getFile(), kind);
      setState();
    });
    btn.refresh = setState;
    return btn;
  }

  let overlay = null;
  function openViewer(entry, urls) {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'vs-img-overlay';
      overlay.innerHTML = '<figure><img alt=""><figcaption></figcaption><div class="vs-ov-actions"></div></figure>';
      overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('on'); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape') overlay.classList.remove('on'); });
      document.body.appendChild(overlay);
    }
    const img = overlay.querySelector('img');
    const cap = overlay.querySelector('figcaption');
    const actions = overlay.querySelector('.vs-ov-actions');
    let i = 0;
    actions.innerHTML = '';
    const rep = makeReportBtn(entry, () => urls[i], 'photo', 'vs-report--wide');
    actions.appendChild(rep);
    const show = () => {
      img.src = urls[i];
      cap.textContent = urls.length > 1 ? `${entry.dutch}  (${i + 1}/${urls.length})` : entry.dutch;
      rep.refresh();
    };
    img.onclick = () => { i = (i + 1) % urls.length; show(); };
    show();
    overlay.classList.add('on');
  }

  /* Desktop (wider than the mobile-card breakpoint in style.css): pictures get their
   * own "Image" column right after "Dutch". On phones the card layout is written
   * against fixed column positions, so there the picture stays inside the Dutch cell. */
  const wide = window.matchMedia('(min-width: 769px)');

  /** Add/remove the header cell and give every body row (spacers too) its image cell. */
  function syncColumn() {
    const headRow = document.querySelector('#word-list thead tr');
    document.getElementById('word-list')?.classList.toggle('vs-has-imgcol', wide.matches);
    const th = headRow?.querySelector('th.vs-img-th');
    if (wide.matches && headRow && !th) {
      const h = document.createElement('th');
      h.className = 'vs-img-th';
      h.textContent = 'Image';
      headRow.insertBefore(h, headRow.children[2] || null);
    } else if (!wide.matches && th) th.remove();

    if (!wide.matches) return;
    Array.from(tableBody.rows).forEach(row => {
      if (row.querySelector('td.vs-imgcell')) return;
      const td = document.createElement('td');
      td.className = 'vs-imgcell';
      row.insertBefore(td, row.cells[2] || null);
    });
  }

  async function addImages(data) {
    if (!Array.isArray(data)) return;
    const [images, hints] = await Promise.all([loadImages(), loadHints()]);
    data.forEach((entry, i) => {
      const urls = images[entry?.dutch];
      const row = tableBody?.rows[i];
      // wide: the dedicated image cell; narrow: inside the Dutch cell
      const host = wide.matches ? row?.querySelector('td.vs-imgcell') : row?.cells[1];
      if (!host || host.querySelector('.vs-pic')) return;

      // one wrapper per word: the picture (or emoji) plus its ⚑ report button
      const pic = document.createElement('span');
      pic.className = 'vs-pic';

      // Fallback when there is no photo (or its file is missing): the word's emoji.
      const emoji = hints[entry?.dutch]?.e;
      const showEmoji = () => {
        if (!emoji) { pic.remove(); return; }
        pic.className = 'vs-pic vs-pic--emoji';
        pic.innerHTML = '';
        const span = document.createElement('span');
        span.className = 'vs-emoji';
        span.textContent = emoji;
        span.setAttribute('aria-hidden', 'true');
        pic.append(span, makeReportBtn(entry, () => '', 'emoji'));
        if (!pic.isConnected) host.appendChild(pic);
      };
      if (!urls?.length) { showEmoji(); return; }

      const img = document.createElement('img');
      img.className = 'vs-thumb';
      img.src = urls[0];
      img.loading = 'lazy';
      img.alt = entry.dutch;
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', showEmoji);   // dead link → emoji instead
      img.addEventListener('click', e => {
        e.stopPropagation();   // don't also trigger the cell's speakText() click
        openViewer(entry, urls);
      });
      pic.append(img, makeReportBtn(entry, () => urls[0], 'photo'));
      host.appendChild(pic);
    });
  }

  const _origReloadTable = window.reloadTable;
  window.reloadTable = function (data) {
    _origReloadTable(data);
    syncColumn();
    addImages(data);
  };

  // Crossing the breakpoint (resize / rotate): rebuild so the picture moves between
  // its own column and the Dutch cell.
  wide.addEventListener('change', () => {
    if (typeof wordList !== 'undefined' && Array.isArray(wordList) && wordList.length) window.reloadTable(wordList);
  });
})();
