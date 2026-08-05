const Groq = require('groq-sdk');

// Collect every configured Groq API key. Supports a comma-separated
// GROQ_API_KEYS and/or GROQ_API_KEY, GROQ_API_KEY_2, and GROQ_API_KEY_3.
function loadKeys() {
  const keys = [];
  const add = (value) => {
    if (!value) return;
    for (const part of String(value).split(',')) {
      const key = part.trim();
      if (key && !keys.includes(key)) keys.push(key);
    }
  };

  add(process.env.GROQ_API_KEYS);
  add(process.env.GROQ_API_KEY);
  add(process.env.GROQ_API_KEY_2);
  add(process.env.GROQ_API_KEY_3);
  return keys;
}

const KEYS = loadKeys();
const clients = new Map();

function clientFor(key) {
  if (!clients.has(key)) clients.set(key, new Groq({ apiKey: key }));
  return clients.get(key);
}

function hasKey() {
  return KEYS.length > 0;
}

function shouldFailover(status) {
  return status === 401 || status === 403 || status === 429 || (status >= 500 && status < 600);
}

let cursor = 0;

async function generateContent({
  model,
  contents,
  systemInstruction,
  responseSchema,
  responseFormat,
  schemaName = 'response',
  maxOutputTokens = 2048,
  reasoningEffort = 'low',
}) {
  if (KEYS.length === 0) {
    const err = new Error('No Groq API key is configured on the server.');
    err.statusCode = 503;
    throw err;
  }

  const params = {
    model,
    messages: [
      ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
      { role: 'user', content: contents },
    ],
    max_completion_tokens: maxOutputTokens,
  };

  if (reasoningEffort) params.reasoning_effort = reasoningEffort;

  if (responseFormat) {
    params.response_format = responseFormat;
  } else if (responseSchema) {
    params.response_format = {
      type: 'json_schema',
      json_schema: {
        name: schemaName,
        strict: true,
        schema: responseSchema,
      },
    };
  }

  // Reserve the next key before awaiting the network request so concurrent
  // calls do not all begin with the same key.
  const start = cursor;
  cursor = (cursor + 1) % KEYS.length;
  let lastErr;
  for (let i = 0; i < KEYS.length; i++) {
    const key = KEYS[(start + i) % KEYS.length];
    try {
      const completion = await clientFor(key).chat.completions.create(params);
      const choice = completion.choices?.[0];
      return {
        text: choice?.message?.content || '',
        finishReason: choice?.finish_reason,
      };
    } catch (err) {
      lastErr = err;
      if (!shouldFailover(Number(err?.status))) throw err;
    }
  }

  throw lastErr;
}

async function* generateContentStream({
  model,
  contents,
  systemInstruction,
  maxOutputTokens = 2048,
  reasoningEffort = 'low',
}) {
  if (KEYS.length === 0) {
    const err = new Error('No Groq API key is configured on the server.');
    err.statusCode = 503;
    throw err;
  }

  const params = {
    model,
    messages: [
      ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
      { role: 'user', content: contents },
    ],
    max_completion_tokens: maxOutputTokens,
    stream: true,
  };

  if (reasoningEffort) params.reasoning_effort = reasoningEffort;

  const start = cursor;
  cursor = (cursor + 1) % KEYS.length;
  let lastErr;
  for (let i = 0; i < KEYS.length; i++) {
    const key = KEYS[(start + i) % KEYS.length];
    let emittedContent = false;
    try {
      const stream = await clientFor(key).chat.completions.create(params);
      for await (const chunk of stream) {
        const text = chunk.choices?.[0]?.delta?.content;
        if (text) {
          emittedContent = true;
          yield text;
        }
      }
      return;
    } catch (err) {
      lastErr = err;
      // Once output has reached the client, retrying with another key would
      // append a second story to the partially streamed first one.
      if (emittedContent) throw err;
      if (!shouldFailover(Number(err?.status))) throw err;
    }
  }

  throw lastErr;
}

module.exports = {
  generateContent,
  generateContentStream,
  hasKey,
  keyCount: () => KEYS.length,
};
