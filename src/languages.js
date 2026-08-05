const LANGUAGES = Object.freeze({
  en: { code: 'en', name: 'English', englishName: 'English', locale: 'en-US' },
  es: { code: 'es', name: 'Spanish', englishName: 'Spanish', locale: 'es-ES' },
  fr: { code: 'fr', name: 'French', englishName: 'French', locale: 'fr-FR' },
  de: { code: 'de', name: 'German', englishName: 'German', locale: 'de-DE' },
  zh: { code: 'zh', name: 'Mandarin Chinese', englishName: 'Mandarin Chinese', locale: 'zh-CN' },
  ja: { code: 'ja', name: 'Japanese', englishName: 'Japanese', locale: 'ja-JP' },
  ko: { code: 'ko', name: 'Korean', englishName: 'Korean', locale: 'ko-KR' },
  it: { code: 'it', name: 'Italian', englishName: 'Italian', locale: 'it-IT' },
  pt: { code: 'pt', name: 'Portuguese', englishName: 'Portuguese', locale: 'pt-PT' },
  ru: { code: 'ru', name: 'Russian', englishName: 'Russian', locale: 'ru-RU' },
  hi: { code: 'hi', name: 'Hindi', englishName: 'Hindi', locale: 'hi-IN' },
  tr: { code: 'tr', name: 'Turkish', englishName: 'Turkish', locale: 'tr-TR' },
  nl: { code: 'nl', name: 'Dutch', englishName: 'Dutch', locale: 'nl-NL' },
  sv: { code: 'sv', name: 'Swedish', englishName: 'Swedish', locale: 'sv-SE' },
  pl: { code: 'pl', name: 'Polish', englishName: 'Polish', locale: 'pl-PL' },
  el: { code: 'el', name: 'Greek', englishName: 'Greek', locale: 'el-GR' },
  he: { code: 'he', name: 'Hebrew', englishName: 'Hebrew', locale: 'he-IL' },
  vi: { code: 'vi', name: 'Vietnamese', englishName: 'Vietnamese', locale: 'vi-VN' },
  th: { code: 'th', name: 'Thai', englishName: 'Thai', locale: 'th-TH' },
  id: { code: 'id', name: 'Indonesian', englishName: 'Indonesian', locale: 'id-ID' },
  cs: { code: 'cs', name: 'Czech', englishName: 'Czech', locale: 'cs-CZ' },
  no: { code: 'no', name: 'Norwegian', englishName: 'Norwegian', locale: 'nb-NO' },
  da: { code: 'da', name: 'Danish', englishName: 'Danish', locale: 'da-DK' },
  fi: { code: 'fi', name: 'Finnish', englishName: 'Finnish', locale: 'fi-FI' },
  uk: { code: 'uk', name: 'Ukrainian', englishName: 'Ukrainian', locale: 'uk-UA' },
  ro: { code: 'ro', name: 'Romanian', englishName: 'Romanian', locale: 'ro-RO' },
  hu: { code: 'hu', name: 'Hungarian', englishName: 'Hungarian', locale: 'hu-HU' },
  sw: { code: 'sw', name: 'Swahili', englishName: 'Swahili', locale: 'sw-KE' },
  bn: { code: 'bn', name: 'Bengali', englishName: 'Bengali', locale: 'bn-BD' },
  ta: { code: 'ta', name: 'Tamil', englishName: 'Tamil', locale: 'ta-IN' },
  pa: { code: 'pa', name: 'Punjabi', englishName: 'Punjabi', locale: 'pa-IN' },
  kn: { code: 'kn', name: 'Kannada', englishName: 'Kannada', locale: 'kn-IN' },
  ms: { code: 'ms', name: 'Malay', englishName: 'Malay', locale: 'ms-MY' },
  tl: { code: 'tl', name: 'Filipino (Tagalog)', englishName: 'Filipino (Tagalog)', locale: 'fil-PH' },
  ca: { code: 'ca', name: 'Catalan', englishName: 'Catalan', locale: 'ca-ES' },
  ga: { code: 'ga', name: 'Irish', englishName: 'Irish', locale: 'ga-IE' },
  cy: { code: 'cy', name: 'Welsh', englishName: 'Welsh', locale: 'cy-GB' },
  eo: { code: 'eo', name: 'Esperanto', englishName: 'Esperanto', locale: 'eo' },
});

const PROFILE_LANGUAGE_CODES = ['en', 'es', 'fr', 'de', 'it', 'pt', 'tr', 'nl', 'sv', 'pl', 'cs', 'da', 'fi', 'ro', 'hu'];

function languageFor(code) {
  return LANGUAGES[code] || null;
}

module.exports = { LANGUAGES, SUPPORTED_LANGUAGE_CODES: Object.keys(LANGUAGES), PROFILE_LANGUAGE_CODES, languageFor };
