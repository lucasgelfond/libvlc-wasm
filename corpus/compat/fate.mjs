// The FFmpeg FATE suite + curated corpus compatibility matrix. Kept as its own
// entry point (`pnpm fate`); the work is done by the generic suite runner:
//   node corpus/compat/fate.mjs [--tool=...] [--only=...] [--resume] ...
// is exactly
//   node corpus/compat/suite.mjs --suite=fate [--tool=...] ...
// See suite.mjs for the options, the criteria and what each cache holds.
if (!process.argv.some((a) => a.startsWith('--suite='))) process.argv.push('--suite=fate');
await import('./suite.mjs');
