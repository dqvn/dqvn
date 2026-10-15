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

  let overlay = null;
  function openViewer(word, urls) {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'vs-img-overlay';
      overlay.innerHTML = '<figure><img alt=""><figcaption></figcaption></figure>';
      overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('on'); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape') overlay.classList.remove('on'); });
      document.body.appendChild(overlay);
    }
    const img = overlay.querySelector('img');
    const cap = overlay.querySelector('figcaption');
    let i = 0;
    const show = () => {
      img.src = urls[i];
      cap.textContent = urls.length > 1 ? `${word}  (${i + 1}/${urls.length})` : word;
    };
    img.onclick = () => { i = (i + 1) % urls.length; show(); };
    show();
    overlay.classList.add('on');
  }

  async function addImages(data) {
    if (!Array.isArray(data)) return;
    const images = await loadImages();
    data.forEach((entry, i) => {
      const urls = images[entry?.dutch];
      const dutchTd = tableBody?.rows[i]?.cells[1];
      if (!urls?.length || !dutchTd || dutchTd.querySelector('.vs-thumb')) return;

      const img = document.createElement('img');
      img.className = 'vs-thumb';
      img.src = urls[0];
      img.loading = 'lazy';
      img.alt = entry.dutch;
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', () => img.remove());   // dead link → just hide it
      img.addEventListener('click', e => {
        e.stopPropagation();   // don't also trigger the cell's speakText() click
        openViewer(entry.dutch, urls);
      });
      dutchTd.appendChild(img);
    });
  }

  const _origReloadTable = window.reloadTable;
  window.reloadTable = function (data) {
    _origReloadTable(data);
    addImages(data);
  };
})();
