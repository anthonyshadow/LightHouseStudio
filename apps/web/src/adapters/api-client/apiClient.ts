/**
 * Compatibility barrel for existing callers. New feature adapters should import
 * the focused transport or resource module directly.
 */
export * from './capabilitiesApi';
export * from './realtimeApi';
export * from './referenceImagesApi';
export * from './transport';
