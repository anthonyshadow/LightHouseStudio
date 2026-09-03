import {
  PROJECT_EXPORT_ASPECTS,
  defaultProjectExportResolution,
  projectExportPreview,
  sentenceList,
  subtitlePlacementsCutByCrop,
  type NormalizedVideoCrop,
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
 * Subtitles are pixels in the cut by the time a placement is chosen, so a crop treats them like any
 * other pixel. Said before the bytes exist: exactly, from the same geometry the renderer uses, when
 * the frame is known; as a plain warning when it is not.
 */
const subtitleSentence = (
  placements: readonly SubtitleCuePlacement[],
  measured: Readonly<{ crop: NormalizedVideoCrop; source: VideoEditSourceGeometry }> | null,
): string => {
  if (placements.length === 0) return '';
  if (measured === null) {
    return ' This cut carries subtitles; a shape that trims the frame can cut into them, and the re-framed video shows exactly what is kept.';
  }
  const cut = subtitlePlacementsCutByCrop(placements, measured.crop, measured.source);
  return cut.length === 0
    ? ' Its subtitles stay inside the kept picture.'
    : ` Subtitles at the ${sentenceList(cut.map((placement) => PLACEMENT_WORDS[placement]))} would be cut by this shape.`;
};

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
  const { width, height } = specification.resolution;
  const shape = `${exportPlacementLabel(specification.aspect).toLowerCase()}, ${width}×${height}`;
  const preview = source === null ? null : projectExportPreview(specification, source);
  if (source === null || preview === null) {
    return `Your video is re-framed to ${shape}. The middle of the picture is kept and whatever falls outside that shape is trimmed off.${subtitleSentence(subtitlePlacements, null)}`;
  }
  const { croppedHorizontalPercent, croppedVerticalPercent } = preview;
  if (croppedHorizontalPercent === 0 && croppedVerticalPercent === 0) {
    return `Your video is already this shape, so nothing is trimmed. It is delivered at ${width}×${height}.`;
  }
  const trimmed =
    croppedHorizontalPercent > 0
      ? `${croppedHorizontalPercent}% of the width is trimmed, evenly from the left and right`
      : `${croppedVerticalPercent}% of the height is trimmed, evenly from the top and bottom`;
  return `Your video is re-framed to ${shape}. The middle of the picture is kept, and ${trimmed}.${subtitleSentence(subtitlePlacements, { crop: preview.crop, source })}`;
};
