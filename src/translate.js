const { generateContent } = require('./gemini');

const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';

const LANG = { de: 'German', en: 'English' };

async function translateText({ text, from, to }) {
  const fromName = LANG[from] || 'German';
  const toName = LANG[to] || 'English';

  let response;
  try {
    response = await generateContent({
      model: MODEL,
      contents: text,
      config: {
        systemInstruction:
          `You are a translation engine. Translate the user's ${fromName} text into ${toName}. ` +
          'Respond with ONLY the translated text — no quotes, no notes, no explanations, no source text.',
        maxOutputTokens: 2048,
      },
    });
  } catch (err) {
    const apiMessage = err?.message || 'Translation failed.';
    const wrapped = new Error(apiMessage);
    const status = Number(err?.status);
    wrapped.statusCode = Number.isInteger(status) && status >= 400 && status < 600 ? status : 502;
    throw wrapped;
  }

  const out = (response.text || '').trim();
  if (!out) throw new Error('No translation returned from the model.');
  return { translation: out };
}

module.exports = { translateText };
