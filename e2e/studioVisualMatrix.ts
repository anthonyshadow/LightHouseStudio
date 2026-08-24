import { STUDIO_VIEWPORT_SIZES } from './support/studioViewports.ts';

export const VISUAL_VIEWPORTS = [
  {
    id: 'desktop',
    folder: '01-full-desktop-1440x960',
    ...STUDIO_VIEWPORT_SIZES.fullDesktop,
  },
  {
    id: 'compact',
    folder: '02-compact-desktop-1280x720',
    ...STUDIO_VIEWPORT_SIZES.compactDesktop,
  },
  {
    id: 'tablet',
    folder: '03-tablet-portrait-834x1112',
    ...STUDIO_VIEWPORT_SIZES.tabletPortrait,
  },
  {
    id: 'mobile',
    folder: '04-mobile-portrait-390x844',
    ...STUDIO_VIEWPORT_SIZES.mobilePortrait,
  },
  {
    id: 'small-mobile',
    folder: '05-small-mobile-320x568',
    ...STUDIO_VIEWPORT_SIZES.smallMobile,
  },
] as const;

export const CORE_VISUAL_SCENARIOS = [
  { id: 'local-camera-live', baseline: '01-studio/local-camera-live.png' },
  { id: 'recording-active', baseline: '01-studio/recording-active.png' },
] as const;

export const ENTRY_VISUAL_SCENARIO = {
  id: 'entry-initial',
  baseline: '00-entry/initial.png',
} as const;

export const ORGANIZATION_VISUAL_SCENARIOS = [
  { id: 'dashboard-overview', baseline: '11-dashboard/overview.png' },
  { id: 'assets-overview', baseline: '12-assets/overview.png' },
] as const;

export const ASSET_FILTER_VISUAL_SCENARIO = {
  id: 'assets-filter-sheet',
  baseline: '12-assets/filters.png',
} as const;

export const STUDIO_INITIAL_VISUAL_SCENARIO = {
  id: 'studio-initial-closed',
  baseline: '01-studio/initial-closed.png',
} as const;

export const STUDIO_PORTRAIT_INITIAL_VISUAL_SCENARIO = {
  id: 'studio-initial-portrait',
  baseline: '01-studio/initial-portrait.png',
} as const;

export const FOCUSED_VISUAL_SCENARIOS = {
  selectedCharacterAiLive: {
    id: 'selected-character-ai-live',
    baseline: '01-studio/selected-character-ai-live.png',
  },
  characterBuilderCombinedReady: {
    id: 'character-builder-combined-ready',
    baseline: '02-character-builder/combined-reference-ready.png',
  },
  savedCharacterSelection: {
    id: 'saved-character-selection',
    baseline: '03-character-library/saved-character-selection.png',
  },
  takePlaybackReviewSettled: {
    id: 'take-playback-review-settled',
    baseline: '04-take-review/playback-review-settled.png',
  },
  uploadChooser: {
    id: 'upload-chooser',
    baseline: '07-existing-video/chooser.png',
  },
  uploadValidatedSetup: {
    id: 'upload-validated-setup',
    baseline: '07-existing-video/validated-setup.png',
  },
  uploadProcessing: {
    id: 'upload-processing',
    baseline: '07-existing-video/processing.png',
  },
  uploadResult: {
    id: 'upload-result',
    baseline: '07-existing-video/result.png',
  },
  videoEditLightingDirty: {
    id: 'video-edit-lighting-dirty',
    baseline: '08-video-editor/lighting-dirty.png',
  },
  videoEditCropDirty: {
    id: 'video-edit-crop-dirty',
    baseline: '08-video-editor/crop-dirty.png',
  },
  campaignsWorkspace: {
    id: 'campaigns-workspace',
    baseline: '10-campaigns/workspace.png',
  },
  projectOutputReview: {
    id: 'project-output-review',
    baseline: '09-projects/output-review.png',
  },
  projectOutputDestination: {
    id: 'project-output-destination',
    baseline: '09-projects/output-destination.png',
  },
} as const;

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
  | (typeof ENTRY_VISUAL_SCENARIO)['id']
  | (typeof ORGANIZATION_VISUAL_SCENARIOS)[number]['id']
  | (typeof ASSET_FILTER_VISUAL_SCENARIO)['id']
  | (typeof STUDIO_INITIAL_VISUAL_SCENARIO)['id']
  | (typeof STUDIO_PORTRAIT_INITIAL_VISUAL_SCENARIO)['id']
  | (typeof CORE_VISUAL_SCENARIOS)[number]['id']
  | (typeof FOCUSED_VISUAL_SCENARIOS)[keyof typeof FOCUSED_VISUAL_SCENARIOS]['id']
  | (typeof DESKTOP_VISUAL_SCENARIOS)[number]['id']
  | (typeof SMALL_MOBILE_VISUAL_SCENARIOS)[number]['id'];

const viewportById = new Map(VISUAL_VIEWPORTS.map((viewport) => [viewport.id, viewport]));
const desktopViewport = viewportById.get('desktop');
const compactViewport = viewportById.get('compact');
const tabletViewport = viewportById.get('tablet');
const mobileViewport = viewportById.get('mobile');
const smallMobileViewport = viewportById.get('small-mobile');
const dashboardOverviewScenario = ORGANIZATION_VISUAL_SCENARIOS[0];
const assetsOverviewScenario = ORGANIZATION_VISUAL_SCENARIOS[1];

if (
  !desktopViewport ||
  !compactViewport ||
  !tabletViewport ||
  !mobileViewport ||
  !smallMobileViewport
) {
  throw new Error('The visual matrix requires all five supported responsive viewports.');
}

export const VISUAL_CASE_MATRIX = [
  { viewport: smallMobileViewport, scenario: ENTRY_VISUAL_SCENARIO },
  { viewport: desktopViewport, scenario: dashboardOverviewScenario },
  { viewport: smallMobileViewport, scenario: dashboardOverviewScenario },
  ...VISUAL_VIEWPORTS.map((viewport) => ({ viewport, scenario: assetsOverviewScenario })),
  ...[tabletViewport, mobileViewport, smallMobileViewport].map((viewport) => ({
    viewport,
    scenario: ASSET_FILTER_VISUAL_SCENARIO,
  })),
  ...VISUAL_VIEWPORTS.flatMap((viewport) =>
    CORE_VISUAL_SCENARIOS.map((scenario) => ({ viewport, scenario })),
  ),
  { viewport: desktopViewport, scenario: STUDIO_INITIAL_VISUAL_SCENARIO },
  { viewport: desktopViewport, scenario: STUDIO_PORTRAIT_INITIAL_VISUAL_SCENARIO },
  { viewport: desktopViewport, scenario: FOCUSED_VISUAL_SCENARIOS.selectedCharacterAiLive },
  {
    viewport: smallMobileViewport,
    scenario: FOCUSED_VISUAL_SCENARIOS.characterBuilderCombinedReady,
  },
  { viewport: desktopViewport, scenario: FOCUSED_VISUAL_SCENARIOS.savedCharacterSelection },
  { viewport: smallMobileViewport, scenario: FOCUSED_VISUAL_SCENARIOS.takePlaybackReviewSettled },
  { viewport: smallMobileViewport, scenario: FOCUSED_VISUAL_SCENARIOS.uploadChooser },
  ...VISUAL_VIEWPORTS.filter(
    (viewport) => viewport.id !== 'desktop' && viewport.id !== 'small-mobile',
  ).map((viewport) => ({
    viewport,
    scenario: FOCUSED_VISUAL_SCENARIOS.uploadValidatedSetup,
  })),
  { viewport: compactViewport, scenario: FOCUSED_VISUAL_SCENARIOS.uploadProcessing },
  { viewport: desktopViewport, scenario: FOCUSED_VISUAL_SCENARIOS.uploadResult },
  ...VISUAL_VIEWPORTS.map((viewport) => ({
    viewport,
    scenario:
      viewport.id === 'mobile' || viewport.id === 'small-mobile'
        ? FOCUSED_VISUAL_SCENARIOS.videoEditCropDirty
        : FOCUSED_VISUAL_SCENARIOS.videoEditLightingDirty,
  })),
  { viewport: desktopViewport, scenario: FOCUSED_VISUAL_SCENARIOS.campaignsWorkspace },
  ...VISUAL_VIEWPORTS.map((viewport) => ({
    viewport,
    scenario: FOCUSED_VISUAL_SCENARIOS.projectOutputReview,
  })),
  { viewport: desktopViewport, scenario: FOCUSED_VISUAL_SCENARIOS.projectOutputDestination },
  { viewport: smallMobileViewport, scenario: FOCUSED_VISUAL_SCENARIOS.projectOutputDestination },
  ...DESKTOP_VISUAL_SCENARIOS.map((scenario) => ({ viewport: desktopViewport, scenario })),
  ...SMALL_MOBILE_VISUAL_SCENARIOS.map((scenario) => ({
    viewport: smallMobileViewport,
    scenario,
  })),
] as const;

export const VISUAL_BASELINE_PATHS = VISUAL_CASE_MATRIX.map(
  ({ viewport, scenario }) => `${viewport.folder}/${scenario.baseline}`,
);

const VISUAL_CASE_BUDGET = 50;
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
