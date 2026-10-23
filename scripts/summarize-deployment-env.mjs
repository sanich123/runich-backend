import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';

const [option, filePath, ...extraArgs] = process.argv.slice(2);
if (option !== '--file' || !filePath || extraArgs.length) {
  console.error('Usage: node scripts/summarize-deployment-env.mjs --file <path>');
  process.exit(1);
}

let values;
try {
  values = parse(readFileSync(filePath, 'utf8'));
} catch {
  console.error('Could not read or parse the deployment .env file.');
  process.exit(1);
}

for (const [key, value] of Object.entries(values).sort(([left], [right]) => left.localeCompare(right))) {
  console.log(`${key}:${value.trim() ? 'set' : 'empty'}`);
}
