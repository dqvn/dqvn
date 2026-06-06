'use strict';
(function () {
  const LANG_KEY = 'nl_ui_lang';
  const _cache   = {};

  window._i18nLang    = localStorage.getItem(LANG_KEY) || 'en';
  window._i18nStrings = {};

  async function _load(lang) {
    if (_cache[lang]) return _cache[lang];
    try {
      const r = await fetch('assets/locales/' + lang + '.json');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      _cache[lang] = await r.json();
    } catch {
      _cache[lang] = {};
    }
    return _cache[lang];
  }

  async function applyLanguage(lang) {
    lang = lang || window._i18nLang;
    const strings = await _load(lang);
    if (!Object.keys(strings).length) return;

    localStorage.setItem(LANG_KEY, lang);
    window._i18nLang    = lang;
    window._i18nStrings = strings;

    document.documentElement.lang = lang === 'nl' ? 'nl' : 'en';

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const v = strings[el.dataset.i18n];
      if (v !== undefined) el.textContent = v;
    });

    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const v = strings[el.dataset.i18nHtml];
      if (v !== undefined) el.innerHTML = v;
    });
  }

  window.applyLanguage  = applyLanguage;
  window.toggleLanguage = () => applyLanguage(window._i18nLang === 'en' ? 'nl' : 'en');
  window._t             = key => window._i18nStrings?.[key] ?? key;

  document.addEventListener('DOMContentLoaded', () => applyLanguage(window._i18nLang));
})();
