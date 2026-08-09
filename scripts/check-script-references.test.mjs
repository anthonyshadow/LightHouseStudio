import { describe, expect, it } from 'vitest';
import { referencedRootScripts } from './check-script-references.mjs';

describe('referencedRootScripts', () => {
  it('extracts root scripts while ignoring Bun built-ins and filtered workspace commands', () => {
    expect([
      ...referencedRootScripts(
        'bun run quality\nbun run audit:prod\nbun audit\nbun install\nbun run --filter @studio/web build',
      ),
    ]).toEqual(['quality', 'audit:prod']);
  });
});
