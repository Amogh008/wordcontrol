require('dotenv').config();

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.GOOGLE_NEW_API_KEY;
const MODEL = process.env.GOOGLE_LOCALE_MODEL || 'gemini-3.6-flash';
const PACKS_DIR = path.resolve(__dirname, '../../wordcontrol/src/locales/packs');
const TARGETS = [
  ['hi', 'Hindi', 'Devanagari'],
  ['bn', 'Bengali', 'Bengali script'],
  ['ta', 'Tamil', 'Tamil script'],
  ['pa', 'Punjabi', 'Gurmukhi script'],
  ['kn', 'Kannada', 'Kannada script'],
];

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function placeholders(value) {
  return [...String(value).matchAll(/\{[^{}]+\}/g)].map(([match]) => match).sort();
}

async function generateJson(entries, language, script) {
  const prompt = [
    `Translate this mobile application interface text from English into natural, modern ${language}.`,
    `Write translations in ${script}.`,
    'Return only one JSON object. Preserve every English key exactly and translate only its value.',
    'Use concise wording suitable for buttons, alerts, settings, games, vocabulary learning, and voice calls.',
    'Preserve all {placeholders} exactly, including their spelling and braces.',
    'Preserve product names, API names, language codes, punctuation intent, emoji, and newline escapes.',
    'Do not transliterate English when a natural native-language UI term exists. Do not omit or add keys.',
    JSON.stringify(Object.fromEntries(entries)),
  ].join('\n');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': API_KEY,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          maxOutputTokens: 20000,
          thinkingConfig: { thinkingLevel: 'minimal' },
        },
      }),
    });

    if (response.ok) {
      const payload = await response.json();
      const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('');
      if (!text) throw new Error(`Gemini returned no text for ${language}.`);
      try {
        return JSON.parse(text);
      } catch (error) {
        if (attempt === 6) throw new Error(`Gemini returned invalid JSON for ${language}: ${error.message}`);
        await sleep(attempt * 1500);
        continue;
      }
    }

    const detail = await response.text();
    if (![429, 500, 503].includes(response.status) || attempt === 6) {
      throw new Error(`Gemini request failed (${response.status}): ${detail.slice(0, 500)}`);
    }
    await sleep(attempt * 5000);
  }
  throw new Error(`Gemini retries exhausted for ${language}.`);
}

async function translatePack(code, language, script, english) {
  const translated = {};
  const entries = Object.entries(english);

  for (let offset = 0; offset < entries.length; offset += entries.length) {
    const chunk = entries.slice(offset, offset + entries.length);
    const result = await generateJson(chunk, language, script);

    for (const [key] of chunk) {
      if (typeof result[key] !== 'string' || !result[key].trim()) {
        throw new Error(`${language} omitted or invalidated key: ${key}`);
      }
      if (JSON.stringify(placeholders(result[key])) !== JSON.stringify(placeholders(key))) {
        throw new Error(`${language} changed placeholders for key: ${key}`);
      }
      translated[key] = result[key];
    }
    console.info(`${language}: ${Math.min(offset + chunk.length, entries.length)}/${entries.length}`);
  }

  if (Object.keys(translated).length !== entries.length) {
    throw new Error(`${language} generated ${Object.keys(translated).length}/${entries.length} keys.`);
  }
  fs.writeFileSync(path.join(PACKS_DIR, `${code}.json`), `${JSON.stringify(translated, null, 2)}\n`);
}

async function main() {
  if (!API_KEY) throw new Error('GOOGLE_NEW_API_KEY is not configured.');
  const english = JSON.parse(fs.readFileSync(path.join(PACKS_DIR, 'en.json'), 'utf8'));
  for (const target of TARGETS) await translatePack(...target, english);
  console.info(`Regenerated ${TARGETS.map(([code]) => code).join(', ')} using ${MODEL}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
