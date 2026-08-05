import { describe, expect, it } from 'vitest';
import { referencedRootScripts } from './check-script-references.mjs';

describe('referencedRootScripts', () => {
  it('extracts root scripts while ignoring pnpm built-ins and options', () => {
    expect([
      ...referencedRootScripts('pnpm quality\npnpm install\npnpm --filter @studio/web build'),
    ]).toEqual(['quality']);
  });
});
