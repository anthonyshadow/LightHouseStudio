import { describe, expect, it } from 'vitest';
import {
  environmentScopedPersistenceName,
  legacyPersistenceNamesForScope,
} from './environmentScope';

describe('browser persistence environment scope', () => {
  it('keeps the same user isolated between development and production', () => {
    expect(environmentScopedPersistenceName('creative-library', 'demo-user', 'development')).toBe(
      'creative-library.development.demo-user',
    );
    expect(environmentScopedPersistenceName('creative-library', 'demo-user', 'production')).toBe(
      'creative-library.production.demo-user',
    );
  });

  it('allows legacy browser data migration only in production', () => {
    const legacyNames = ['creative-library.demo-user', 'creative-library'];
    expect(legacyPersistenceNamesForScope(legacyNames, 'development')).toEqual([]);
    expect(legacyPersistenceNamesForScope(legacyNames, 'production')).toEqual(legacyNames);
  });
});
