const { generateContent } = require('./groq');

const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

const SYSTEM = `You are a note-formatting assistant. The user pastes raw, messy text they copied from somewhere (articles, chats, docs).
Reformat it into clean, legible plain text:
- Fix spacing, broken line breaks, and punctuation.
- Turn list-like content into clear line-by-line bullet points using the Unicode bullet "•".
- Add short paragraph breaks where it improves readability.
- Preserve existing headings, but write them as ordinary plain-text lines.
- Preserve all original information and meaning; do not add commentary or new content.
- Output plain text only. Never use Markdown markers such as *, **, _, #, backticks, or code fences.
- Never use LaTeX commands or delimiters such as $, \\(...\\), or \\[...\\].
Return only the reformatted text.`;

function cleanPlainText(text) {
  return text
    .replace(/```(?:[a-z0-9_-]+)?\s*\n?/gi, '')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\\\((.*?)\\\)/gs, '$1')
    .replace(/\\\[(.*?)\\\]/gs, '$1')
    .replace(/\$([^$\n]+)\$/g, '$1')
    .replace(/\\(?:text|mathrm|mathbf|textbf|emph)\{([^{}]*)\}/g, '$1')
    .replace(/\\(?:rightarrow|to)\b/g, '→')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function formatNoteContent({ content }) {
  let response;
  try {
    response = await generateContent({
      model: MODEL,
      contents: content,
      systemInstruction: SYSTEM,
      maxOutputTokens: 2048,
    });
  } catch (err) {
    const apiMessage = err?.message || 'Groq request failed.';
    const wrapped = new Error(apiMessage);
    const status = Number(err?.status);
    wrapped.statusCode = Number.isInteger(status) && status >= 400 && status < 600 ? status : 502;
    throw wrapped;
  }

  if (response.finishReason === 'length') {
    const err = new Error('The formatted note was too long. Please try again with shorter content.');
    err.statusCode = 502;
    throw err;
  }

  const text = response.text;
  if (!text) throw new Error('No content returned from the model.');
  return cleanPlainText(text);
}

module.exports = { cleanPlainText, formatNoteContent };
