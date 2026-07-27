export const VISUAL_VIEWPORTS = [
  { id: 'desktop', folder: '01-full-desktop-1440x960', width: 1_440, height: 960 },
  { id: 'compact', folder: '02-compact-desktop-1280x720', width: 1_280, height: 720 },
  { id: 'tablet', folder: '03-tablet-portrait-834x1112', width: 834, height: 1_112 },
  { id: 'mobile', folder: '04-mobile-portrait-390x844', width: 390, height: 844 },
  { id: 'small-mobile', folder: '05-small-mobile-320x568', width: 320, height: 568 },
] as const;

export const CORE_VISUAL_SCENARIOS = [
  { id: 'idle', baseline: '01-studio/local-idle.png' },
  { id: 'recording', baseline: '01-studio/local-recording.png' },
  { id: 'character-live', baseline: '01-studio/character-ai-live.png' },
] as const;

export const FOCUSED_VISUAL_SCENARIOS = [
  { id: 'ai-experience-choice', baseline: '01-studio/ai-experience-choice.png' },
  { id: 'finalizing', baseline: '01-studio/local-finalizing.png' },
  { id: 'media-error', baseline: '01-studio/stage-media-error.png' },
  { id: 'vton-live', baseline: '01-studio/virtual-try-on-ai-live.png' },
  { id: 'workshop-overlay', baseline: '03-character-workshop/add-one-object.png' },
  { id: 'capture-overlay', baseline: '05-capture-settings/local-before-preview.png' },
  { id: 'review-overlay', baseline: '06-take-review/latest-take.png' },
] as const;

export type VisualScenarioId =
  (typeof CORE_VISUAL_SCENARIOS)[number]['id'] | (typeof FOCUSED_VISUAL_SCENARIOS)[number]['id'];

const focusedViewportIds = new Set(['desktop', 'small-mobile']);

export const VISUAL_CASE_MATRIX = [
  ...VISUAL_VIEWPORTS.flatMap((viewport) =>
    CORE_VISUAL_SCENARIOS.map((scenario) => ({ viewport, scenario })),
  ),
  ...VISUAL_VIEWPORTS.filter((viewport) => focusedViewportIds.has(viewport.id)).flatMap(
    (viewport) => FOCUSED_VISUAL_SCENARIOS.map((scenario) => ({ viewport, scenario })),
  ),
] as const;

export const VISUAL_BASELINE_PATHS = VISUAL_CASE_MATRIX.map(
  ({ viewport, scenario }) => `${viewport.folder}/${scenario.baseline}`,
);

if (VISUAL_CASE_MATRIX.length !== 29 || new Set(VISUAL_BASELINE_PATHS).size !== 29) {
  throw new Error(
    `The curated visual suite must contain exactly 29 unique cases, got ${VISUAL_CASE_MATRIX.length} cases and ${new Set(VISUAL_BASELINE_PATHS).size} baselines.`,
  );
}
