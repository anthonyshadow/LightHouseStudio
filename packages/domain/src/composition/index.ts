/*
 * `./operations` is deliberately absent. Re-exporting it put the arrangement's clip gestures in
 * the module graph of every file that imports the domain barrel — the shell and every Studio route
 * — because chunk assignment follows that graph rather than the tree-shaken binding set. Only the
 * lazily loaded arrangement editor calls them, and it reaches them at `@studio/domain/composition`.
 * The bundle ledger names this as the fix; see `scripts/check-build-manifest.mjs`.
 */
export * from './audio';
export * from './rules';
export * from './sequence';
export * from './types';
export * from './video';
