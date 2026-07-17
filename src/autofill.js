const { GoogleGenAI, Type } = require('@google/genai');

// Constructed lazily so a missing GEMINI_API_KEY never breaks server boot —
// the route guards on the key before calling in here.
let client;
function getClient() {
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';

// Structured-output schema: forces Gemini to return exactly these fields as
// valid JSON, so no brittle text parsing is needed.
const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    artikel: {
      type: Type.STRING,
      description: 'The definite article der/die/das for a noun, or "" if the word is not a noun.',
    },
    bedeutung: {
      type: Type.STRING,
      description: 'The English meaning of the word. A few words, not a full sentence.',
    },
    notizen: {
      type: Type.STRING,
      description:
        'Short helpful notes: plural form for nouns, one example sentence with translation, and a memory aid if useful. Keep it to 2-3 short lines.',
    },
  },
  required: ['artikel', 'bedeutung', 'notizen'],
  propertyOrdering: ['artikel', 'bedeutung', 'notizen'],
};

const SYSTEM = `You are a German-English dictionary assistant for an English speaker learning German.
Given a German word, return its English meaning and concise study notes.
- bedeutung: the English translation, kept short (a few words).
- artikel: for a noun, its definite article (der/die/das); "" for anything that is not a noun.
- notizen: for a noun include the plural; add one short example sentence in German with its English translation; add a brief memory aid only if genuinely helpful. Keep notes to a few short lines.`;

async function autofillWord({ wort, artikel }) {
  const hint = artikel ? ` (the user thinks the article is "${artikel}")` : '';

  let response;
  try {
    response = await getClient().models.generateContent({
      model: MODEL,
      contents: `German word: "${wort}"${hint}`,
      config: {
        systemInstruction: SYSTEM,
        responseMimeType: 'application/json',
        responseSchema: SCHEMA,
        maxOutputTokens: 1024,
      },
    });
  } catch (err) {
    // Surface the real Gemini message (bad key, quota, rate limit) instead of a
    // generic 500.
    const apiMessage = err?.message || 'Gemini request failed.';
    const wrapped = new Error(apiMessage);
    const status = Number(err?.status);
    wrapped.statusCode = Number.isInteger(status) && status >= 400 && status < 600 ? status : 502;
    throw wrapped;
  }

  const text = response.text;
  if (!text) throw new Error('No content returned from the model.');
  return JSON.parse(text);
}

module.exports = { autofillWord };
