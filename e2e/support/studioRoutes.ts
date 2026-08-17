export const ENTRY_PATH = '/' as const;
export const DASHBOARD_PATH = '/dashboard' as const;
export const STUDIO_PATH = '/studio/create' as const;
export const CAMPAIGNS_PATH = '/campaigns' as const;
/** Pre-rename singular path, kept reachable by `canonicalizeLegacyAppPath`. */
export const LEGACY_CAMPAIGNS_PATH = '/campaign' as const;
