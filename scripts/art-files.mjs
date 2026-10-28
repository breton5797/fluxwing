// The game's Higgsfield art: every art/*.webp, for the builds that copy the page's files (ios-build.mjs, portal-build.mjs).
// sw.js lists the same names for its precache; tests/art.test.js checks all of them against index.html's art block.
import { readdirSync } from 'node:fs';

export const ART_FILES = readdirSync(new URL('../art/', import.meta.url)).filter(f => f.endsWith('.webp')).sort().map(f => `art/${f}`);
