import { describe, expect, it } from 'vitest';
import { createPostgresDatabase } from './client.js';

describe('PostgreSQL client configuration', () => {
  it('fails before opening a Neon pool when encrypted transport is not explicit', () => {
    expect(() =>
      createPostgresDatabase('postgresql://user:password@example.neon.tech/lightframe', {
        requireTls: true,
      }),
    ).toThrow('encrypted transport');
  });
});
