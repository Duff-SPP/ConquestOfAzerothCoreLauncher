// Native dialog labels use the same catalog as the renderer.
const catalogs = { fr: require('../localization/fr.json'), ru: require('../localization/ru.json'), 'zh-CN': require('../localization/zh-CN.json') };
function translateNative(language, text) {
  return catalogs[language]?.[text] ?? text;
}
module.exports = { translateNative };
