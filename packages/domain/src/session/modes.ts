export const LOCAL_MODE_ID = 'local' as const;
export const CHARACTER_MODEL_ID = 'lucy-2.5' as const;
export const VTON_MODEL_ID = 'lucy-vton-3' as const;

export const MODEL_MODE_IDS = [CHARACTER_MODEL_ID, VTON_MODEL_ID] as const;
export type ModelModeId = (typeof MODEL_MODE_IDS)[number];
export type SessionModeId = typeof LOCAL_MODE_ID | ModelModeId;

export interface LocalSessionMode {
  readonly id: typeof LOCAL_MODE_ID;
  readonly kind: 'local';
  readonly label: string;
  readonly inputSemantics: 'none';
}

export interface ModelSessionMode {
  readonly id: ModelModeId;
  readonly kind: 'model';
  readonly label: string;
  readonly providerModelId: ModelModeId;
  readonly inputSemantics: 'character' | 'garment';
}

export type SessionMode = LocalSessionMode | ModelSessionMode;

export const SESSION_MODES = {
  local: {
    id: 'local',
    kind: 'local',
    label: 'Local camera',
    inputSemantics: 'none',
  },
  'lucy-2.5': {
    id: 'lucy-2.5',
    kind: 'model',
    label: 'Character',
    providerModelId: 'lucy-2.5',
    inputSemantics: 'character',
  },
  'lucy-vton-3': {
    id: 'lucy-vton-3',
    kind: 'model',
    label: 'Virtual try-on',
    providerModelId: 'lucy-vton-3',
    inputSemantics: 'garment',
  },
} as const satisfies Readonly<Record<SessionModeId, SessionMode>>;

export const isModelModeId = (value: unknown): value is ModelModeId =>
  value === CHARACTER_MODEL_ID || value === VTON_MODEL_ID;

export const isSessionModeId = (value: unknown): value is SessionModeId =>
  value === LOCAL_MODE_ID || isModelModeId(value);

export const getSessionMode = (id: SessionModeId): SessionMode => SESSION_MODES[id];
