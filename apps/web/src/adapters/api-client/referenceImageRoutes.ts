export const referenceImageContentUrl = (assetId: string): string =>
  `/api/reference-images/${encodeURIComponent(assetId)}/content`;
