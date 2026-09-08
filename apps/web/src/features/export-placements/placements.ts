import {
  PROJECT_EXPORT_ASPECTS,
  defaultProjectExportResolution,
  projectExportPreview,
  sentenceList,
  subtitlePlacementsCutByCrop,
  type ProjectExportAspect,
  type ProjectExportSpecification,
  type SubtitleCuePlacement,
  type VideoEditSourceGeometry,
} from '@studio/domain';

/**
 * The operator is asked where the video is going, not what aspect ratio it should be. The ratio and
 * the pixel size are secondary detail, and they come from the domain so this copy cannot drift from
 * what is actually produced.
 */
const PLACEMENT_COPY: Readonly<
  Record<
    ProjectExportAspect,
    { readonly label: string; readonly shortLabel: string; readonly going: string }
  >
> = {
  source: {
    label: 'Keep as it is',
    shortLabel: 'As is',
    going: 'The video keeps the shape it already has. Nothing is cropped.',
  },
  '9:16': {
    label: 'Phone, full screen',
    shortLabel: 'Phone',
    going: 'Fills a phone screen — Reels, Stories, TikTok, Shorts.',
  },
  '16:9': {
    label: 'Widescreen',
    shortLabel: 'Wide',
    going: 'Lies down wide — YouTube, a site header, a landscape ad.',
  },
  '1:1': {
    label: 'Square post',
    shortLabel: 'Square',
    going: 'A square feed post.',
  },
  '4:5': {
    label: 'Tall feed post',
    shortLabel: 'Tall',
    going: 'Taller than a square, for the Instagram and Facebook feed.',
  },
};

export interface ExportPlacementOption {
  readonly aspect: ProjectExportAspect;
  readonly label: string;
  readonly shortLabel: string;
}

export const EXPORT_PLACEMENT_OPTIONS: readonly ExportPlacementOption[] =
  PROJECT_EXPORT_ASPECTS.map((aspect) => ({
    aspect,
    label: PLACEMENT_COPY[aspect].label,
    shortLabel: PLACEMENT_COPY[aspect].shortLabel,
  }));

export const exportPlacementLabel = (aspect: ProjectExportAspect): string =>
  PLACEMENT_COPY[aspect].label;

/** Compact CTA copy for the same placement; the full label remains its accessible name. */
export const exportPlacementShortLabel = (aspect: ProjectExportAspect): string =>
  PLACEMENT_COPY[aspect].shortLabel;

/** Where it goes, then the ratio and size as supporting detail. */
export const exportPlacementHint = (aspect: ProjectExportAspect): string => {
  const resolution = defaultProjectExportResolution(aspect);
  return resolution === null
    ? PLACEMENT_COPY[aspect].going
    : `${PLACEMENT_COPY[aspect].going} ${aspect}, ${resolution.width}×${resolution.height}.`;
};

/** The one-line form History and a saved record use to state what a change was for. */
export const exportSpecificationSummary = (
  specification: ProjectExportSpecification | null,
): string => {
  if (specification === null || specification.resolution === null) {
    return exportPlacementLabel('source');
  }
  const { aspect, resolution, includeAudio } = specification;
  return `${exportPlacementLabel(aspect)} · ${aspect} · ${resolution.width}×${resolution.height}${
    includeAudio ? '' : ' · no audio'
  }`;
};

/** The regions as a sentence names them; a new region has to be given a word here. */
const PLACEMENT_WORDS: Readonly<Record<SubtitleCuePlacement, string>> = {
  top: 'top',
  middle: 'middle',
  bottom: 'bottom',
};

/**
 * What a shape does to the cut's burned-in subtitles: there are none to speak of, this shape keeps
 * every region they use, this shape's crop takes one, or the frame they are drawn on has not been
 * measured yet, so nothing exact can be said and the risk is all there is to say.
 *
 * Four outcomes and not a sentence-or-null, because the two silences are not the same silence. A
 * shape that keeps the subtitles and a frame nobody has measured both used to answer "nothing to
 * say", and one call site told them apart while the other could not — so while the measurement was
 * in flight, and it is a network read, every placement the save also offers said nothing at all.
 * The sentence comes with the outcome; which outcomes a surface renders, and how, is its own.
 */
export type ExportPlacementSubtitleOutlook =
  | { readonly kind: 'none' }
  | { readonly kind: 'kept'; readonly sentence: string }
  | { readonly kind: 'cut'; readonly sentence: string }
  | { readonly kind: 'unmeasured'; readonly sentence: string };

const SUBTITLES_KEPT_SENTENCE = 'Its subtitles stay inside the kept picture.';
const SUBTITLES_UNMEASURED_SENTENCE =
  'This cut carries subtitles; a shape that trims the frame can cut into them, and the re-framed video shows exactly what is kept.';

/**
 * The one place the rule is stated. A placement is offered in two places and the harm is the same
 * in both: the chooser folds this into its description of the placement the revision records, and
 * the save form says it under each extra placement it also offers. It informs and never blocks — an
 * uncaptioned product shot or a music-led cut is a deliverable somebody meant to make.
 */
export const exportPlacementSubtitleOutlook = (
  specification: ProjectExportSpecification | null,
  source: VideoEditSourceGeometry | null,
  subtitlePlacements: readonly SubtitleCuePlacement[],
): ExportPlacementSubtitleOutlook => {
  if (subtitlePlacements.length === 0) return { kind: 'none' };
  // No resolution is the absence of a re-frame, so there is no crop for a subtitle to fall outside
  // of — knowing the source frame would add nothing.
  if (specification === null || specification.resolution === null) {
    return { kind: 'kept', sentence: SUBTITLES_KEPT_SENTENCE };
  }
  const preview = source === null ? null : projectExportPreview(specification, source);
  if (source === null || preview === null) {
    return { kind: 'unmeasured', sentence: SUBTITLES_UNMEASURED_SENTENCE };
  }
  const cut = subtitlePlacementsCutByCrop(subtitlePlacements, preview.crop, source);
  return cut.length === 0
    ? { kind: 'kept', sentence: SUBTITLES_KEPT_SENTENCE }
    : {
        kind: 'cut',
        sentence: `Subtitles at the ${sentenceList(cut.map((placement) => PLACEMENT_WORDS[placement]))} would be cut by this shape.`,
      };
};

/**
 * Subtitles are pixels in the cut by the time a placement is chosen, so a crop treats them like any
 * other pixel. Said before the bytes exist: exactly, from the same geometry the renderer uses, when
 * the frame is known; as a plain warning when it is not. This surface says all three out loud, as
 * a clause of the sentence describing the shape.
 */
const subtitleSentence = (outlook: ExportPlacementSubtitleOutlook): string =>
  outlook.kind === 'none' ? '' : ` ${outlook.sentence}`;

/**
 * What the operator will get, in words. The source frame is only known once the media it applies
 * to has been measured, so the crop cost is stated exactly when it can be and left unstated — never
 * guessed — when it cannot. The same goes for the cut's subtitles, when it has any.
 */
export const exportPlacementDescription = (
  specification: ProjectExportSpecification | null,
  source: VideoEditSourceGeometry | null,
  subtitlePlacements: readonly SubtitleCuePlacement[] = [],
): string => {
  if (specification === null || specification.resolution === null) {
    return 'Your video is saved exactly as you see it now, in the shape it already has.';
  }
  const subtitles = subtitleSentence(
    exportPlacementSubtitleOutlook(specification, source, subtitlePlacements),
  );
  const { width, height } = specification.resolution;
  const shape = `${exportPlacementLabel(specification.aspect).toLowerCase()}, ${width}×${height}`;
  const preview = source === null ? null : projectExportPreview(specification, source);
  if (source === null || preview === null) {
    return `Your video is re-framed to ${shape}. The middle of the picture is kept and whatever falls outside that shape is trimmed off.${subtitles}`;
  }
  const { croppedHorizontalPercent, croppedVerticalPercent } = preview;
  if (croppedHorizontalPercent === 0 && croppedVerticalPercent === 0) {
    return `Your video is already this shape, so nothing is trimmed. It is delivered at ${width}×${height}.`;
  }
  const trimmed =
    croppedHorizontalPercent > 0
      ? `${croppedHorizontalPercent}% of the width is trimmed, evenly from the left and right`
      : `${croppedVerticalPercent}% of the height is trimmed, evenly from the top and bottom`;
  return `Your video is re-framed to ${shape}. The middle of the picture is kept, and ${trimmed}.${subtitles}`;
};
