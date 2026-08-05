require('dotenv').config();
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const t = require('@babel/types');
const { generateContent } = require('../src/groq');

const frontend = path.resolve(__dirname, '../../wordcontrol');
const sourceRoot = path.join(frontend, 'src');
const outputRoot = path.join(sourceRoot, 'locales', 'packs');
const languages = [
  ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['zh', 'Mandarin Chinese'],
  ['ja', 'Japanese'], ['ko', 'Korean'], ['it', 'Italian'], ['pt', 'Portuguese'],
  ['ru', 'Russian'], ['hi', 'Hindi'], ['tr', 'Turkish'], ['nl', 'Dutch'], ['sv', 'Swedish'],
  ['pl', 'Polish'], ['el', 'Greek'], ['he', 'Hebrew'], ['vi', 'Vietnamese'], ['th', 'Thai'],
  ['id', 'Indonesian'], ['cs', 'Czech'], ['no', 'Norwegian'], ['da', 'Danish'], ['fi', 'Finnish'],
  ['uk', 'Ukrainian'], ['ro', 'Romanian'], ['hu', 'Hungarian'], ['sw', 'Swahili'],
  ['bn', 'Bengali'], ['ta', 'Tamil'], ['pa', 'Punjabi'], ['kn', 'Kannada'], ['ms', 'Malay'],
  ['tl', 'Filipino (Tagalog)'], ['ca', 'Catalan'], ['ga', 'Irish'], ['cy', 'Welsh'], ['eo', 'Esperanto'],
];
const geminiLocaleCodes = new Set(['hi', 'bn', 'ta', 'pa', 'kn']);

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'locales' ? [] : sourceFiles(target);
    return target.endsWith('.js') ? [target] : [];
  });
}

function phrases() {
  const values = new Set();
  for (const filename of sourceFiles(sourceRoot)) {
    const ast = parser.parse(fs.readFileSync(filename, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
    traverse(ast, {
      CallExpression(ref) {
        if (!t.isIdentifier(ref.node.callee, { name: 'localize' })
          && !t.isIdentifier(ref.node.callee, { name: 'localizeFormat' })) return;
        const english = ref.node.arguments[0];
        if (t.isStringLiteral(english)) values.add(english.value);
      },
      VariableDeclarator(ref) {
        if (!t.isIdentifier(ref.node.id, { name: 'en' }) || !t.isObjectExpression(ref.node.init)) return;
        for (const property of ref.node.init.properties) {
          if (t.isObjectProperty(property) && t.isStringLiteral(property.value)) values.add(property.value.value);
        }
      },
    });
  }
  return [...values].sort();
}

async function translatePack(code, name, englishPhrases, model) {
  const target = path.join(outputRoot, `${code}.json`);
  const translated = fs.existsSync(target) ? JSON.parse(fs.readFileSync(target, 'utf8')) : {};
  const missingPhrases = englishPhrases.filter((phrase) => typeof translated[phrase] !== 'string');
  for (let index = 0; index < missingPhrases.length; index += 40) {
    const chunk = missingPhrases.slice(index, index + 40);
    let response;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      try {
        response = await generateContent({
          model,
          systemInstruction: `Translate application interface copy from English to ${name}. Return one valid JSON object whose keys are the exact English inputs and values are concise, natural ${name} UI translations. Preserve placeholders, punctuation, acronyms, product names, language codes, and newline escapes. Do not omit or add keys.`,
          contents: JSON.stringify(Object.fromEntries(chunk.map((phrase) => [phrase, phrase]))),
          responseFormat: { type: 'json_object' },
          maxOutputTokens: 5000,
          reasoningEffort: null,
        });
        break;
      } catch (error) {
        if (![400, 429].includes(Number(error.status)) || attempt === 11) throw error;
        if (Number(error.status) === 400) continue;
        const seconds = Number(error.headers?.get?.('retry-after')) || 8;
        await new Promise((resolve) => setTimeout(resolve, Math.min(65, seconds + 1) * 1000));
      }
    }
    Object.assign(translated, JSON.parse(response.text));
  }
  for (const phrase of englishPhrases) if (typeof translated[phrase] !== 'string') translated[phrase] = phrase;
  fs.writeFileSync(target, `${JSON.stringify(translated, null, 2)}\n`);
  console.info(`Generated ${code}`);
}

async function main() {
  fs.mkdirSync(outputRoot, { recursive: true });
  const englishPhrases = phrases();
  fs.writeFileSync(path.join(outputRoot, 'en.json'), `${JSON.stringify(Object.fromEntries(englishPhrases.map((phrase) => [phrase, phrase])), null, 2)}\n`);
  const models = ['llama-3.1-8b-instant', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile'];
  const groqLanguages = languages.filter(([code]) => !geminiLocaleCodes.has(code));
  for (let index = 0; index < groqLanguages.length; index += 3) {
    await Promise.all(groqLanguages.slice(index, index + 3).map(([code, name], offset) =>
      translatePack(code, name, englishPhrases, models[offset])));
  }
  const imports = ['en', ...languages.map(([code]) => code)].map((code) => `import ${code} from './${code}.json';`).join('\n');
  const codes = ['en', ...languages.map(([code]) => code)].join(', ');
  fs.writeFileSync(path.join(outputRoot, 'index.js'), `${imports}\n\nexport default { ${codes} };\n`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
