export const VISUAL_VIEWPORTS = [
  { id: 'desktop', folder: '01-full-desktop-1440x960', width: 1_440, height: 960 },
  { id: 'compact', folder: '02-compact-desktop-1280x720', width: 1_280, height: 720 },
  { id: 'tablet', folder: '03-tablet-portrait-834x1112', width: 834, height: 1_112 },
  { id: 'mobile', folder: '04-mobile-portrait-390x844', width: 390, height: 844 },
  { id: 'small-mobile', folder: '05-small-mobile-320x568', width: 320, height: 568 },
] as const;

export const CORE_VISUAL_SCENARIOS = [
  { id: 'studio-initial-closed', baseline: '01-studio/initial-closed.png' },
  { id: 'local-camera-live', baseline: '01-studio/local-camera-live.png' },
  { id: 'recording-active', baseline: '01-studio/recording-active.png' },
] as const;

export const FOCUSED_VISUAL_SCENARIOS = [
  { id: 'ai-experience-choice', baseline: '01-studio/ai-experience-choice.png' },
  { id: 'selected-character-ai-live', baseline: '01-studio/selected-character-ai-live.png' },
  {
    id: 'character-builder-combined-ready',
    baseline: '02-character-builder/combined-reference-ready.png',
  },
  {
    id: 'saved-character-selection',
    baseline: '03-character-library/saved-character-selection.png',
  },
  {
    id: 'take-playback-review-settled',
    baseline: '04-take-review/playback-review-settled.png',
  },
] as const;

export const DESKTOP_VISUAL_SCENARIOS = [
  {
    id: 'vton-prepared-with-reference',
    baseline: '05-virtual-try-on/prepared-with-reference.png',
  },
  { id: 'voice-browser-loaded', baseline: '06-voice/voice-browser-loaded.png' },
] as const;

export const SMALL_MOBILE_VISUAL_SCENARIOS = [
  { id: 'take-finalizing', baseline: '01-studio/take-finalizing.png' },
  { id: 'media-permission-error', baseline: '01-studio/media-permission-error.png' },
] as const;

export type VisualScenarioId =
  | (typeof CORE_VISUAL_SCENARIOS)[number]['id']
  | (typeof FOCUSED_VISUAL_SCENARIOS)[number]['id']
  | (typeof DESKTOP_VISUAL_SCENARIOS)[number]['id']
  | (typeof SMALL_MOBILE_VISUAL_SCENARIOS)[number]['id'];

const focusedViewportIds = new Set(['desktop', 'small-mobile']);
const viewportById = new Map(VISUAL_VIEWPORTS.map((viewport) => [viewport.id, viewport]));
const desktopViewport = viewportById.get('desktop');
const smallMobileViewport = viewportById.get('small-mobile');

if (!desktopViewport || !smallMobileViewport) {
  throw new Error('The visual matrix requires desktop and small-mobile viewports.');
}

export const VISUAL_CASE_MATRIX = [
  ...VISUAL_VIEWPORTS.flatMap((viewport) =>
    CORE_VISUAL_SCENARIOS.map((scenario) => ({ viewport, scenario })),
  ),
  ...VISUAL_VIEWPORTS.filter((viewport) => focusedViewportIds.has(viewport.id)).flatMap(
    (viewport) => FOCUSED_VISUAL_SCENARIOS.map((scenario) => ({ viewport, scenario })),
  ),
  ...DESKTOP_VISUAL_SCENARIOS.map((scenario) => ({ viewport: desktopViewport, scenario })),
  ...SMALL_MOBILE_VISUAL_SCENARIOS.map((scenario) => ({
    viewport: smallMobileViewport,
    scenario,
  })),
] as const;

export const VISUAL_BASELINE_PATHS = VISUAL_CASE_MATRIX.map(
  ({ viewport, scenario }) => `${viewport.folder}/${scenario.baseline}`,
);

const VISUAL_CASE_BUDGET = 29;
const coveredViewportIds = new Set(VISUAL_CASE_MATRIX.map(({ viewport }) => viewport.id));
const corePairs = new Set(
  VISUAL_CASE_MATRIX.map(({ viewport, scenario }) => `${viewport.id}/${scenario.id}`),
);
const missingCorePairs = VISUAL_VIEWPORTS.flatMap((viewport) =>
  CORE_VISUAL_SCENARIOS.map((scenario) => `${viewport.id}/${scenario.id}`),
).filter((pair) => !corePairs.has(pair));

if (
  VISUAL_CASE_MATRIX.length > VISUAL_CASE_BUDGET ||
  new Set(VISUAL_BASELINE_PATHS).size !== VISUAL_CASE_MATRIX.length ||
  coveredViewportIds.size !== VISUAL_VIEWPORTS.length ||
  missingCorePairs.length > 0
) {
  throw new Error(
    `Invalid curated visual matrix: ${VISUAL_CASE_MATRIX.length}/${VISUAL_CASE_BUDGET} cases, ${new Set(VISUAL_BASELINE_PATHS).size} unique baselines, ${coveredViewportIds.size}/${VISUAL_VIEWPORTS.length} viewports, ${missingCorePairs.length} missing core pairs.`,
  );
}
