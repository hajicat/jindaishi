import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(__dirname, '..', '..', '5工刷题2.html');
const html = readFileSync(htmlPath, 'utf-8');

function extractArray(varName) {
  const regex = new RegExp(`(?:let|const|var)\\s+${varName}\\s*=\\s*([\\[\\s\\S]*?\\n\\]);`);
  const match = html.match(regex);
  if (!match) throw new Error(`Could not find ${varName}`);
  return JSON.parse(match[1]);
}

const singleData = extractArray('singleData');
const multiData = extractArray('multiData');
const tfData = extractArray('tfData');
const essayData = extractArray('essayData');

// Add IDs and type labels
let id = 1;
const allQuestions = [];

for (const q of singleData) {
  allQuestions.push({ id: `S${id++}`, type: 'single', ...q });
}
id = 1;
for (const q of multiData) {
  allQuestions.push({ id: `M${id++}`, type: 'multi', ...q });
}
id = 1;
for (const q of tfData) {
  allQuestions.push({ id: `T${id++}`, type: 'tf', ...q });
}
id = 1;
for (const q of essayData) {
  allQuestions.push({ id: `E${id++}`, type: 'essay', ...q });
}

const outPath = join(__dirname, '..', 'src', 'lib', 'quiz-data.json');
writeFileSync(outPath, JSON.stringify(allQuestions, null, 2), 'utf-8');

console.log(`Extracted ${allQuestions.length} questions:`);
console.log(`  Single: ${singleData.length}`);
console.log(`  Multi:  ${multiData.length}`);
console.log(`  TF:     ${tfData.length}`);
console.log(`  Essay:  ${essayData.length}`);
console.log(`Written to ${outPath}`);
