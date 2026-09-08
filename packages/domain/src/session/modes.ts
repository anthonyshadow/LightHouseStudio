export const LOCAL_MODE_ID = 'local' as const;
export const CHARACTER_MODEL_ID = 'lucy-latest' as const;
export const VTON_MODEL_ID = 'lucy-vton-latest' as const;

export const MODEL_MODE_IDS = [CHARACTER_MODEL_ID, VTON_MODEL_ID] as const;
export type ModelModeId = (typeof MODEL_MODE_IDS)[number];
export type SessionModeId = typeof LOCAL_MODE_ID | ModelModeId;

export const isModelModeId = (value: unknown): value is ModelModeId =>
  value === CHARACTER_MODEL_ID || value === VTON_MODEL_ID;

export const isSessionModeId = (value: unknown): value is SessionModeId =>
  value === LOCAL_MODE_ID || isModelModeId(value);
