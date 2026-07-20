import type {
  CharacterReferenceBackground,
  CharacterReferenceExpression,
  CharacterReferenceFraming,
  CharacterReferenceGenerator,
  CharacterReferenceOptions,
  CharacterReferenceOrientation,
  CharacterReferenceRenderingMode,
} from '@studio/contracts';

export const WORKSHOP_REFERENCE_PREFERENCES_STORAGE_KEY =
  'realtime-creator-studio.character-reference-preferences.v1';

export const REFERENCE_FRAMING_VALUES = [
  'head_and_shoulders',
  'waist_up',
  'full_body',
] as const satisfies readonly CharacterReferenceFraming[];

export const REFERENCE_ORIENTATION_VALUES = [
  'auto',
  'portrait_9_16',
  'landscape_16_9',
  'square',
] as const satisfies readonly CharacterReferenceOrientation[];

export const REFERENCE_RENDERING_MODE_VALUES = [
  'photorealistic',
  'faithful_source_style',
] as const satisfies readonly CharacterReferenceRenderingMode[];

export const REFERENCE_EXPRESSION_VALUES = [
  'neutral',
  'subtle_friendly',
] as const satisfies readonly CharacterReferenceExpression[];

export const REFERENCE_BACKGROUND_VALUES = [
  'neutral_gray',
  'off_white',
  'plain_custom',
] as const satisfies readonly CharacterReferenceBackground[];

export type WorkshopReferenceOptions = Omit<CharacterReferenceOptions, 'targetUse'>;

export interface WorkshopReferencePreferences {
  optimizePrompt: boolean;
  options: WorkshopReferenceOptions;
}

export const DEFAULT_WORKSHOP_REFERENCE_PREFERENCES: WorkshopReferencePreferences = {
  optimizePrompt: true,
  options: {
    framing: 'full_body',
    orientation: 'auto',
    renderingMode: 'photorealistic',
    expression: 'neutral',
    background: 'neutral_gray',
  },
};

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

const normalizeWhitespace = (value: string): string => value.replace(/\s+/gu, ' ').trim();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isOneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && values.some((candidate) => candidate === value);

const browserStorage = (): PreferenceStorage | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const sanitizeWorkshopReferencePreferences = (
  value: unknown,
): WorkshopReferencePreferences => {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.options)) {
    return DEFAULT_WORKSHOP_REFERENCE_PREFERENCES;
  }

  const options = value.options;
  if (
    typeof value.optimizePrompt !== 'boolean' ||
    !isOneOf(REFERENCE_FRAMING_VALUES, options.framing) ||
    !isOneOf(REFERENCE_ORIENTATION_VALUES, options.orientation) ||
    !isOneOf(REFERENCE_RENDERING_MODE_VALUES, options.renderingMode) ||
    !isOneOf(REFERENCE_EXPRESSION_VALUES, options.expression) ||
    !isOneOf(REFERENCE_BACKGROUND_VALUES, options.background)
  ) {
    return DEFAULT_WORKSHOP_REFERENCE_PREFERENCES;
  }

  const customBackground =
    typeof options.customBackground === 'string'
      ? normalizeWhitespace(options.customBackground).slice(0, 200)
      : '';

  return {
    optimizePrompt: value.optimizePrompt,
    options: {
      framing: options.framing,
      orientation: options.orientation,
      renderingMode: options.renderingMode,
      expression: options.expression,
      background: options.background,
      ...(options.background === 'plain_custom' && customBackground ? { customBackground } : {}),
    },
  };
};

export const loadWorkshopReferencePreferences = (
  storage: PreferenceStorage | null = browserStorage(),
): WorkshopReferencePreferences => {
  if (!storage) return DEFAULT_WORKSHOP_REFERENCE_PREFERENCES;
  try {
    const serialized = storage.getItem(WORKSHOP_REFERENCE_PREFERENCES_STORAGE_KEY);
    return serialized
      ? sanitizeWorkshopReferencePreferences(JSON.parse(serialized) as unknown)
      : DEFAULT_WORKSHOP_REFERENCE_PREFERENCES;
  } catch {
    return DEFAULT_WORKSHOP_REFERENCE_PREFERENCES;
  }
};

export const saveWorkshopReferencePreferences = (
  preferences: WorkshopReferencePreferences,
  storage: PreferenceStorage | null = browserStorage(),
): void => {
  if (!storage) return;
  try {
    storage.setItem(
      WORKSHOP_REFERENCE_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, ...preferences }),
    );
  } catch {
    // Preference persistence is best-effort; generation must remain usable.
  }
};

export const normalizeWorkshopReferenceOptions = (
  options: WorkshopReferenceOptions,
): WorkshopReferenceOptions => ({
  framing: options.framing,
  orientation: options.orientation,
  renderingMode: options.renderingMode,
  expression: options.expression,
  background: options.background,
  ...(options.background === 'plain_custom' && options.customBackground?.trim()
    ? { customBackground: normalizeWhitespace(options.customBackground) }
    : {}),
});

export const createOptimizerReferenceOptions = (
  options: WorkshopReferenceOptions,
): CharacterReferenceOptions => ({
  ...normalizeWorkshopReferenceOptions(options),
  targetUse: 'lucy_2_5_character_reference',
});

export const isCustomBackgroundMissing = (options: WorkshopReferenceOptions): boolean =>
  options.background === 'plain_custom' && !options.customBackground?.trim();

export const createWorkshopOptimizationKey = (
  rawPrompt: string,
  options: WorkshopReferenceOptions,
  optimizerModel: string | null | undefined,
  optimizerVersion: string | null | undefined,
  generator: CharacterReferenceGenerator | null | undefined,
): string =>
  JSON.stringify({
    rawPrompt: normalizeWhitespace(rawPrompt),
    options: normalizeWorkshopReferenceOptions(options),
    optimizerModel: optimizerModel ?? null,
    optimizerVersion: optimizerVersion ?? null,
    generator: generator ?? null,
  });
