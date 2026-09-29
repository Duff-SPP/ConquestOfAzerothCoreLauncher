'use strict';
// English source text is the fallback. Only explicitly authored UI strings are translated.
const launcherI18n = (() => {
  let language = 'en';
  const catalogs = Object.create(null);
  const messagePatterns = Object.create(null);
  const languages = [{ code: 'en', name: 'English' }];
  function normalize(text) {
    const indices = [];
    return { key: text.replace(/\{(\d+)\}/g, (_, index) => `{${indices.push(Number(index)) - 1}}`), indices };
  }
  function translate(text) {
    if (typeof text !== 'string' || language === 'en') return text;
    const leading = text.match(/^\s*/)[0], trailing = text.match(/\s*$/)[0];
    const { key, indices } = normalize(text.trim());
    const translated = catalogs[language]?.[key];
    if (translated === undefined) return text;
    return leading + translated.replace(/\{(\d+)\}/g, (_, index) => `{${indices[Number(index)] ?? index}}`) + trailing;
  }
  function markup(source) {
    // Work on authored markup BEFORE interpolating values. Never translate player data.
    return source.split(/(<[^>]*>)/g).map(part => part.startsWith('<')
      ? part.replace(/\b(aria-label|placeholder|title|alt)="([^"]*)"/g, (_, name, value) => `${name}="${translate(value).replace(/"/g, '&quot;')}"`)
      : translate(part)).join('');
  }
  function message(text) {
    if (typeof text !== 'string' || language === 'en') return text;
    const exact = translate(text);
    if (exact !== text) return exact;
    // IPC can prepend a method name. Keep that diagnostic prefix outside the translation.
    const ipc = text.match(/^(Error invoking remote method '[^']+': (?:Error: )?)([\s\S]*)$/);
    if (ipc) return ipc[1] + message(ipc[2]);
    for (const { pattern, translated } of messagePatterns[language] || []) {
      const match = pattern.exec(text);
      if (match) return translated.replace(/\{(\d+)\}/g, (_, index) => match[Number(index) + 1] ?? '');
    }
    return text;
  }
  function template(strings, values, html) {
    let source = strings.reduce((result, part, i) => result + part + (i < values.length ? `{${i}}` : ''), '');
    source = html ? markup(source) : translate(source);
    return source.replace(/\{(\d+)\}/g, (token, index) => Number(index) < values.length ? String(values[Number(index)]) : token);
  }
  return {
    languages,
    get language() { return language; },
    setLanguage(code) { language = languages.some(item => item.code === code) ? code : 'en'; document.documentElement.lang = language; },
    register(code, name, entries, complete = false) {
      const catalog = Object.create(null);
      for (const [source, translated] of Object.entries(entries)) catalog[normalize(source.trim()).key] = translated.trim();
      catalogs[code] = catalog;
      messagePatterns[code] = Object.entries(catalog).filter(([key]) => /\{\d+\}/.test(key)).map(([key, translated]) => ({
        pattern: new RegExp('^' + key.split(/\{\d+\}/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('([\\s\\S]*?)') + '$'), translated
      }));
      if (complete) languages.push({ code, name });
    },
    t: translate,
    message,
    html: markup,
    textTemplate(strings, ...values) { return template(strings, values, false); },
    htmlTemplate(strings, ...values) { return template(strings, values, true); }
  };
})();
const t = launcherI18n.t;
const lh = launcherI18n.htmlTemplate;
const lt = launcherI18n.textTemplate;
const tm = launcherI18n.message;
