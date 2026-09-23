'use strict';

/* VanStart-only add-on: a small 🔤 button before each Dutch word plays it
 * letter-by-letter with the same real-voice mp3 clips used in leesblad.html
 * (data/leesblad/sounds.json + assets/audio/klanken-nl/), then reads the
 * whole word via the page's own TTS (speakTextAsync, same voice/rate/volume
 * as everything else here).
 *
 * Isolated on purpose: this file only wraps reloadTable() and only touches
 * DOM it creates itself — common.js and startnl.html (which also loads
 * common.js) are completely untouched, so the existing click-to-hear
 * behaviour on the Dutch cell keeps working exactly as before.
 *
 * Script order matters: this must load AFTER common.js (needs reloadTable)
 * but BEFORE ttsvanstartscript.js (whose initPage() call captures whichever
 * reloadTable is current at that moment as its callback for the page's very
 * first lesson load).
 */
(function () {
  const SND_BASE = 'assets/audio/klanken-nl/';
  // Same list as leesblad.html's chunk() — longest-first so "schr"/"sch" win
  // over their shorter prefixes at the same position.
  const DIGRAPHS = ['schr', 'sch', 'aa', 'ee', 'oo', 'uu', 'ie', 'oe', 'eu', 'ui', 'ij', 'ou', 'au', 'ei', 'ch', 'ng', 'nk', 'uw'];

  let soundsPromise = null;
  function loadSounds() {
    if (!soundsPromise) soundsPromise = fetch('data/leesblad/sounds.json').then(r => r.ok ? r.json() : {}).catch(() => ({}));
    return soundsPromise;
  }

  function chunk(word) {
    const out = [];
    for (let i = 0; i < word.length;) {
      const hit = DIGRAPHS.find(d => word.startsWith(d, i));
      if (hit) { out.push(hit); i += hit.length; }
      else { out.push(word[i]); i++; }
    }
    return out;
  }

  function playClip(file) {
    return new Promise(resolve => {
      const a = new Audio(SND_BASE + file);
      a.volume = 1;
      a.addEventListener('ended', () => resolve(true));
      a.addEventListener('error', () => resolve(false));
      a.play().catch(() => resolve(false));
    });
  }

  const wait = ms => new Promise(r => setTimeout(r, ms));

  let runId = 0;
  async function spellWord(word, btn) {
    const id = ++runId;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    document.querySelectorAll('.spell-btn.spelling').forEach(b => b.classList.remove('spelling'));
    btn.classList.add('spelling');

    const sounds = await loadSounds();
    if (id !== runId) return;

    // Skip spelling out a leading article ("de "/"het ") and any "- plural"
    // or ", plural" variant tacked on after it — many vocab entries store
    // both forms together, e.g. "de computer - computers" or "de foto,
    // foto's". A beginner sounding a word out letter-by-letter needs just
    // the one base word, not the article or the second form too. The full
    // word (article, plural and all) is still spoken normally at the end,
    // via speakTextAsync(word) below — only the letter-by-letter clip
    // breakdown is trimmed down to the single base word.
    const spellSource = word
      .replace(/^\s*(de|het)\s+/i, '')
      .split(/\s*[-,]\s*/)[0];

    // Keep letters and spaces only (so a multi-word "dutch" entry like
    // "de kat" gets a small natural pause where the space is); lowercase to
    // match sounds.json's keys.
    const letters = spellSource.toLowerCase().replace(/[^a-zà-ÿ ]/g, '');
    for (const g of chunk(letters)) {
      if (id !== runId) return;
      const file = sounds[g];
      if (file) await playClip(file);
      else await wait(260);   // no clip for this grapheme (e.g. a space) — small beat instead
      if (id !== runId) return;
    }
    await wait(450);   // short pause between the spelled-out letters and the whole word
    if (id !== runId) return;

    if (typeof speakTextAsync === 'function') await speakTextAsync(word);
    else if (typeof speakText === 'function') speakText(word);
    if (id === runId) btn.classList.remove('spelling');
  }

  function addSpellButtons(data) {
    if (!Array.isArray(data)) return;
    data.forEach((entry, i) => {
      const row = tableBody?.rows[i];
      const dutchTd = row?.cells[1];
      const word = entry?.dutch;
      const wordSpan = dutchTd?.querySelector('.dutch-word');
      if (!dutchTd || !word || !wordSpan || dutchTd.querySelector('.spell-btn')) return;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'spell-btn';
      btn.textContent = '🔤';
      btn.title = 'Spel dit woord letter voor letter';
      btn.setAttribute('aria-label', 'Spel dit woord letter voor letter');
      btn.addEventListener('click', e => {
        e.stopPropagation();   // don't also trigger the cell's own speakText() click
        spellWord(word, btn);
      });

      // The Dutch <td> is a flex column on mobile (card layout) — a plain
      // inserted button there stacks as its own row above the word instead
      // of sitting beside it. Wrapping both in one inline-flex span keeps
      // "button beside the word" true in both the desktop table and the
      // mobile card. .append() moves the existing wordSpan node (it doesn't
      // clone it), so nothing about it — listeners, text — is disturbed.
      const wrap = document.createElement('span');
      wrap.className = 'dutch-word-row';
      wordSpan.before(wrap);
      wrap.append(btn, wordSpan);
    });
  }

  const _origReloadTable = window.reloadTable;
  window.reloadTable = function (data) {
    _origReloadTable(data);
    addSpellButtons(data);
  };
})();
