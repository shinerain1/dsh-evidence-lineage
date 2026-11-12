import { readFileSync } from 'node:fs';
import { verifyBundle } from './store.js';
if (process.argv[2] !== 'verify' || !process.argv[3])
    throw new Error('Usage: node lib/cli.js verify <bundle.json>');
console.log(JSON.stringify(verifyBundle(JSON.parse(readFileSync(process.argv[3], 'utf8')))));
