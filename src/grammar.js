const { generateContent } = require('./groq');

const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    correct: {
      type: 'boolean',
      description: 'true if the sentence has no grammar, spelling, case, or word-order mistakes.',
    },
    corrected: {
      type: 'string',
      description: 'The fully corrected German sentence. If it is already correct, return it unchanged.',
    },
    feedback: {
      type: 'string',
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
      systemInstruction: SYSTEM,
      responseSchema: SCHEMA,
      schemaName: 'grammar_check',
      maxOutputTokens: 2048,
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
  if (response.finishReason === 'length') {
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
