/* Headless verification that icons.js executes cleanly */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsJs = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'icons.js'), 'utf8');

// Minimal browser-ish stubs
const stubs = {
  document: {
    readyState: 'complete',
    addEventListener: () => {},
    querySelectorAll: () => [],
    body: { querySelectorAll: () => [] }
  },
  window: {},
  MutationObserver: class { observe() {} }
};

// Execute the file in a sandbox-ish way using Function
try {
  const fn = new Function('document', 'window', 'MutationObserver',
    iconsJs + '\nreturn { ICON_SVG, renderIcons };'
  );
  const result = fn(stubs.document, stubs.window, stubs.MutationObserver);
  const keys = Object.keys(result.ICON_SVG);
  console.log('OK — icons defined:', keys.length);
  console.log('First 5:', keys.slice(0, 5).join(', '));
  console.log('renderIcons is function:', typeof result.renderIcons === 'function');
} catch (err) {
  console.error('SYNTAX/RUNTIME ERROR in icons.js:');
  console.error(err.message);
  process.exit(1);
}
