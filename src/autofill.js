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
        'Study notes with each item on its OWN line, separated by a newline (\\n). ' +
        'Line 1 "Plural: ..." (include only for nouns). Line 2 "Example: <German sentence> (<English translation>)". ' +
        'Line 3 "Memory aid: ..." — ALWAYS include a helpful mnemonic or tip. Do not run them together.',
    },
  },
  required: ['artikel', 'bedeutung', 'notizen'],
  propertyOrdering: ['artikel', 'bedeutung', 'notizen'],
};

const SYSTEM = `You are a German-English dictionary assistant for an English speaker learning German.
Given a German word, return its English meaning and concise study notes.
- bedeutung: the English translation, kept short (a few words).
- artikel: for a noun, its definite article (der/die/das); "" for anything that is not a noun.
- notizen: put each note on its OWN line, separated by a real newline character. Use this layout:
Plural: <plural form> (include this line only for nouns; skip it for non-nouns)
Example: <a short German sentence> (<its English translation>)
Memory aid: <a helpful mnemonic or tip to remember the word — ALWAYS include this line>
Never run the plural, example, and memory aid together on one line.`;

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
