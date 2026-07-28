const { generateContent } = require('./groq');

const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

// Structured-output schema: forces Groq to return exactly these fields as
// valid JSON, so no brittle text parsing is needed.
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    wort: {
      type: 'string',
      description: 'The correctly spelled German word, including correct capitalization.',
    },
    artikel: {
      type: 'string',
      description: 'The definite article der/die/das for a noun, or "" if the word is not a noun.',
    },
    bedeutung: {
      type: 'string',
      description: 'The English meaning of the word. A few words, not a full sentence.',
    },
    notizen: {
      type: 'string',
      description:
        'Study notes with each item on its OWN line, separated by a newline (\\n). ' +
        'Line 1 "Plural: ..." (include only for nouns). Line 2 "Example: <German sentence> (<English translation>)". ' 
    },
  },
  required: ['wort', 'artikel', 'bedeutung', 'notizen'],
};

const SYSTEM = `You are a German-English dictionary assistant for an English speaker learning German.
Given a German word, return its English meaning and concise study notes.
- wort: return the German word with corrected spelling and capitalization. Preserve the intended word and do not replace it with a synonym.
- bedeutung: the English translation, kept short (a few words).
- artikel: for a noun, its definite article (der/die/das); "" for anything that is not a noun.
- Treat the user's currently selected article only as a hint. Always return the correct article, replacing the hint when it is wrong.
- notizen: put each note on its OWN line, separated by a real newline character. Use this layout:
Plural: <plural form> (include this line only for nouns; skip it for non-nouns)
Example: <a short German sentence> (<its English translation>)
Never run the plural and example together on one line.`;

async function autofillWord({ wort, artikel }) {
  const hint = artikel
    ? ` (currently selected article: "${artikel}"; correct it if it is wrong)`
    : '';

  let response;
  try {
    response = await generateContent({
      model: MODEL,
      contents: `German word: "${wort}"${hint}`,
      systemInstruction: SYSTEM,
      responseSchema: SCHEMA,
      schemaName: 'word_autofill',
      maxOutputTokens: 2048,
    });
  } catch (err) {
    // Surface the real Groq message (bad key, quota, rate limit) instead of a
    // generic 500.
    const apiMessage = err?.message || 'Groq request failed.';
    const wrapped = new Error(apiMessage);
    const status = Number(err?.status);
    wrapped.statusCode = Number.isInteger(status) && status >= 400 && status < 600 ? status : 502;
    throw wrapped;
  }

  // If the model still hit the token ceiling the JSON is cut off; surface a
  // clear message instead of a raw "Unterminated string in JSON" parse crash.
  if (response.finishReason === 'length') {
    const err = new Error('The autofill response was too long. Please try again.');
    err.statusCode = 502;
    throw err;
  }

  const text = response.text;
  if (!text) throw new Error('No content returned from the model.');
  try {
    return JSON.parse(text);
  } catch {
    const err = new Error('Autofill returned a malformed response. Please try again.');
    err.statusCode = 502;
    throw err;
  }
}

module.exports = { autofillWord };
