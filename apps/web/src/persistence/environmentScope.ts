const fallbackScope = 'unknown';

export const currentBrowserPersistenceScope = (): string => {
  const mode = import.meta.env.MODE.trim();
  return mode === '' ? fallbackScope : mode;
};

export const environmentScopedPersistenceName = (
  baseName: string,
  ownerUserId: string,
  scope = currentBrowserPersistenceScope(),
): string => `${baseName}.${scope}.${ownerUserId}`;

export const legacyPersistenceNamesForScope = (
  names: readonly string[],
  scope = currentBrowserPersistenceScope(),
): string[] => (scope === 'production' ? [...names] : []);
