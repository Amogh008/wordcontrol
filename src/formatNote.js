const { generateContent } = require('./gemini');

const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';

const SYSTEM = `You are a note-formatting assistant. The user pastes raw, messy text they copied from somewhere (articles, chats, docs).
Reformat it into clean, legible plain text:
- Fix spacing, broken line breaks, and punctuation.
- Turn list-like content into clear line-by-line bullet points (use "- ").
- Add short paragraph breaks where it improves readability.
- Preserve all original information and meaning; do not add commentary, headers, or new content.
- Do not wrap the output in markdown code fences or quotes.
Return only the reformatted text.`;

async function formatNoteContent({ content }) {
  let response;
  try {
    response = await generateContent({
      model: MODEL,
      contents: content,
      config: {
        systemInstruction: SYSTEM,
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: 2048,
      },
    });
  } catch (err) {
    const apiMessage = err?.message || 'Gemini request failed.';
    const wrapped = new Error(apiMessage);
    const status = Number(err?.status);
    wrapped.statusCode = Number.isInteger(status) && status >= 400 && status < 600 ? status : 502;
    throw wrapped;
  }

  if (response.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
    const err = new Error('The formatted note was too long. Please try again with shorter content.');
    err.statusCode = 502;
    throw err;
  }

  const text = response.text;
  if (!text) throw new Error('No content returned from the model.');
  return text.trim();
}

module.exports = { formatNoteContent };
