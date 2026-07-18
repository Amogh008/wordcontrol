const { Type } = require('@google/genai');
const { generateContent } = require('./gemini');

const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';

const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    correct: {
      type: Type.BOOLEAN,
      description: 'true if the sentence has no grammar, spelling, case, or word-order mistakes.',
    },
    corrected: {
      type: Type.STRING,
      description: 'The fully corrected German sentence. If it is already correct, return it unchanged.',
    },
    feedback: {
      type: Type.STRING,
      description:
        'In English. If there are mistakes, list each on its OWN line (separated by \\n): what is wrong and the rule. ' +
        'If the sentence is correct, give a short confirmation.',
    },
  },
  required: ['correct', 'corrected', 'feedback'],
  propertyOrdering: ['correct', 'corrected', 'feedback'],
};

const SYSTEM = `You are a German grammar checker for an English speaker learning German.
Given a German sentence, decide whether it is grammatically correct.
- correct: true only if there are no grammar, spelling, case, or word-order mistakes.
- corrected: the fully corrected sentence; if it is already correct, return it unchanged.
- feedback: written in English. If there are mistakes, list each one on its OWN line, explaining what is wrong and the rule (e.g. wrong case, verb position, article, adjective ending, capitalization). If the sentence is correct, give a short confirmation.`;

async function checkGrammar({ sentence }) {
  let response;
  try {
    response = await generateContent({
      model: MODEL,
      contents: sentence,
      config: {
        systemInstruction: SYSTEM,
        responseMimeType: 'application/json',
        responseSchema: SCHEMA,
        // gemini-flash-latest thinks by default, and those tokens come out of
        // maxOutputTokens — leaving the JSON truncated (unterminated string).
        // Disable thinking and give the response room so it always completes.
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 2048,
      },
    });
  } catch (err) {
    const apiMessage = err?.message || 'Grammar check failed.';
    const wrapped = new Error(apiMessage);
    const status = Number(err?.status);
    wrapped.statusCode = Number.isInteger(status) && status >= 400 && status < 600 ? status : 502;
    throw wrapped;
  }

  // If the model still hit the token ceiling the JSON is cut off; surface a
  // clear message instead of a raw "Unterminated string in JSON" parse crash.
  if (response.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
    const err = new Error('The grammar check response was too long. Please try a shorter sentence.');
    err.statusCode = 502;
    throw err;
  }

  const text = (response.text || '').trim();
  if (!text) throw new Error('No response from the model.');
  try {
    return JSON.parse(text);
  } catch {
    const err = new Error('The grammar checker returned a malformed response. Please try again.');
    err.statusCode = 502;
    throw err;
  }
}

module.exports = { checkGrammar };
