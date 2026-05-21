/* Headless syntax check for app.js — does it parse without error? */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const name of ['icons.js', 'api.js', 'app.js']) {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', name), 'utf8');
  try {
    new Function(src);
    console.log(`OK — ${name} parses (${src.length} bytes)`);
  } catch (err) {
    console.error(`PARSE ERROR in ${name}:`, err.message);
    process.exit(1);
  }
}

// Concatenated parse — simulates browser loading all in one global scope
const combined = ['icons.js', 'api.js', 'app.js']
  .map(n => fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', n), 'utf8'))
  .join('\n;\n');
try {
  new Function(combined);
  console.log('OK — combined global-scope parse (no const collisions)');
} catch (err) {
  console.error('COMBINED PARSE ERROR:', err.message);
  process.exit(1);
}
