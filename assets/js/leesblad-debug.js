'use strict';
// Leesblad on-screen debug bar — only active with ?debug=1 in the URL (e.g. leesblad.html?debug=1).
// Built for devices without a dev console (iPad Chrome): logs every speechSynthesis call and event
// (speak / cancel / pause / resume, start / end / error + error code / boundary), the voice list,
// page errors and mp3 playback, and has a Copy button so the log can be pasted into a chat.
// Loaded BEFORE leesbladscript.js so the speechSynthesis wrappers see every call.
(function () {
  if (!/[?&]debug=1\b/.test(location.search)) return;

  const t0 = Date.now();
  const lines = [];
  let box = null;
  function log(msg) {
    const s = '+' + ((Date.now() - t0) / 1000).toFixed(2) + 's ' + msg;
    lines.push(s);
    if (lines.length > 400) lines.shift();
    if (box) { box.textContent = lines.join('\n'); box.scrollTop = box.scrollHeight; }
  }
  window.lbDebug = log;

  const ss = window.speechSynthesis;
  const state = () => ss ? `[speaking=${ss.speaking} pending=${ss.pending} paused=${ss.paused}]` : '[no speechSynthesis]';

  log('UA: ' + navigator.userAgent);
  log('screen ' + innerWidth + 'x' + innerHeight + ', lang=' + navigator.language);

  if (ss) {
    // Wrap the engine calls so the page's own TTS code is logged without any change to it
    const speak0 = ss.speak.bind(ss), cancel0 = ss.cancel.bind(ss), pause0 = ss.pause.bind(ss), resume0 = ss.resume.bind(ss);
    ss.speak = function (u) {
      log(`speak "${u.text}" lang=${u.lang} rate=${u.rate} vol=${u.volume} voice=${u.voice ? u.voice.name : '(default)'} ${state()}`);
      ['start', 'end', 'pause', 'resume'].forEach(ev => u.addEventListener(ev, () => log('  event ' + ev + ' "' + u.text + '"')));
      u.addEventListener('error', e => log('  ERROR "' + u.text + '" code=' + e.error));
      u.addEventListener('boundary', e => log('  boundary ' + e.name + '@' + e.charIndex));
      return speak0(u);
    };
    ss.cancel = function () { log('cancel() ' + state()); return cancel0(); };
    ss.pause  = function () { log('pause() '  + state()); return pause0(); };
    ss.resume = function () { log('resume() ' + state()); return resume0(); };
    ss.addEventListener('voiceschanged', () => log('voiceschanged: ' + ss.getVoices().length + ' voices'));
  }

  window.addEventListener('error', e => log('JS ERROR: ' + e.message + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno));
  window.addEventListener('unhandledrejection', e => log('PROMISE REJECTION: ' + (e.reason && e.reason.message || e.reason)));
  document.addEventListener('visibilitychange', () => log('visibility: ' + document.visibilityState));
  // mp3 clips: log play()/error for every <audio> the page creates
  const Audio0 = window.Audio;
  window.Audio = function (src) {
    const a = new Audio0(src);
    a.addEventListener('error', () => log('AUDIO ERROR ' + (src || '').split('/').pop() + ' code=' + (a.error && a.error.code)));
    const p0 = a.play.bind(a);
    a.play = function () { const p = p0(); if (p && p.catch) p.catch(e => log('AUDIO play() rejected ' + (src || '').split('/').pop() + ': ' + e.name)); return p; };
    return a;
  };
  window.Audio.prototype = Audio0.prototype;

  function voices() {
    const v = ss ? ss.getVoices() : [];
    log('voices: ' + v.length + ' total; Dutch: ' + (v.filter(x => x.lang.startsWith('nl')).map(x => x.name + ' (' + x.lang + (x.localService ? ', local' : ', remote') + ')').join(' | ') || 'NONE'));
  }

  function build() {
    const bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#111;color:#9f9;font:11px/1.35 monospace;border-top:2px solid #0f0;';
    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;padding:4px;background:#222;';
    box = document.createElement('pre');
    box.style.cssText = 'margin:0;padding:6px;height:30vh;overflow:auto;white-space:pre-wrap;word-break:break-word;-webkit-user-select:text;user-select:text;';
    const mk = (label, fn) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = 'font:12px sans-serif;padding:6px 9px;border-radius:6px;border:1px solid #666;background:#333;color:#fff;';
      b.addEventListener('click', e => { e.stopPropagation(); fn(); });
      btns.append(b); return b;
    };
    mk('📋 Copy', () => {
      const text = lines.join('\n');
      const fallback = () => { const r = document.createRange(); r.selectNodeContents(box); const s = getSelection(); s.removeAllRanges(); s.addRange(r); log('Clipboard blocked — log selected, use the iPad "Copy" popup'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => log('copied ' + text.length + ' chars'), fallback);
      else fallback();
    });
    mk('🗑 Clear', () => { lines.length = 0; box.textContent = ''; });
    mk('Voices', voices);
    mk('State', () => log('state ' + state()));
    // Tests that bypass the page's own TTS code, called straight from this tap:
    const say = (label, setup) => mk(label, () => {
      if (!ss) { log('no speechSynthesis'); return; }
      const u = new SpeechSynthesisUtterance('Hallo, dit is een test.');
      setup(u); ss.speak(u);
    });
    say('Test: default', u => {});
    say('Test: nl-NL', u => { u.lang = 'nl-NL'; });
    say('Test: nl voice', u => { const v = ss.getVoices().find(x => x.lang.startsWith('nl')); u.lang = 'nl-NL'; if (v) u.voice = v; else log('no Dutch voice'); });
    say('Test: English', u => { u.text = 'Hello, this is a test.'; u.lang = 'en-US'; });
    mk('Test: mp3', () => { const a = new Audio('assets/audio/klanken-nl/a.mp3'); a.play().then(() => log('mp3 playing'), e => log('mp3 failed: ' + e.name)); });
    mk('Hide', () => { box.style.display = box.style.display === 'none' ? '' : 'none'; });
    bar.append(btns, box);
    document.body.append(bar);
    box.textContent = lines.join('\n');
    voices();
    log('mute switch / volume: speech is silent when the iPad is in silent mode');
  }
  if (document.body) build(); else document.addEventListener('DOMContentLoaded', build);
})();
