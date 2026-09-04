import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import {
  projectExportPreview,
  projectExportSpecificationForAspect,
  type ProjectExportAspect,
  type ProjectExportSpecification,
  type SubtitleCuePlacement,
  type VideoEditSourceGeometry,
} from '@studio/domain';
import { SegmentedControl, StatusNotice } from '../../ui';
import {
  EXPORT_PLACEMENT_OPTIONS,
  exportPlacementDescription,
  exportPlacementHint,
  exportPlacementLabel,
} from './placements';

const PREVIEW_WIDTH = 220;
const PREVIEW_HEIGHT = 124;
const PLACEMENT_ASPECT_RATIOS: Readonly<Record<ProjectExportAspect, number>> = {
  source: 16 / 9,
  '9:16': 9 / 16,
  '16:9': 16 / 9,
  '1:1': 1,
  '4:5': 4 / 5,
};

const SEGMENTS = EXPORT_PLACEMENT_OPTIONS.map(({ aspect, label, shortLabel }) => ({
  value: aspect,
  label,
  shortLabel,
}));

const previewStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  justifyItems: 'center',
  gap: theme.space.sm,
  padding: theme.space.sm,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.canvasRaised,
});

const chooserStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: theme.space.sm,
  containerType: 'inline-size',
  '& [data-placement-segments] > [role="group"]': {
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  },
  '& [data-placement-segments] > [role="group"] > button:last-child': {
    gridColumn: '1 / -1',
  },
  '& [data-placement-segments] [data-segment-label="full"]': { display: 'none' },
  '& [data-placement-segments] [data-segment-label="short"]': { display: 'inline' },
  '@container (min-width: 31rem)': {
    '& [data-placement-segments] > [role="group"]': {
      gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
    },
    '& [data-placement-segments] > [role="group"] > button:last-child': {
      gridColumn: 'auto',
    },
    '& [data-placement-segments] [data-segment-label="full"]': { display: 'inline' },
    '& [data-placement-segments] [data-segment-label="short"]': { display: 'none' },
  },
});

/**
 * A schematic of the source frame with the kept region drawn inside it. It states the geometry
 * rather than the picture on purpose: it is exact wherever the media has been measured, it needs no
 * bytes and no request, and it reads the same on every surface that offers a placement.
 */
const CropPreview = ({
  specification,
  source,
}: {
  readonly specification: ProjectExportSpecification;
  readonly source: VideoEditSourceGeometry;
}) => {
  const theme = useTheme();
  const preview = projectExportPreview(specification, source);
  if (preview === null) return null;
  const sourceAspect = source.width / source.height;
  const frameWidth =
    sourceAspect >= PREVIEW_WIDTH / PREVIEW_HEIGHT ? PREVIEW_WIDTH : PREVIEW_HEIGHT * sourceAspect;
  const frameHeight = frameWidth / sourceAspect;
  const { crop } = preview;
  return (
    <svg
      role="presentation"
      aria-hidden="true"
      width={frameWidth}
      height={frameHeight}
      viewBox={`0 0 ${frameWidth} ${frameHeight}`}
      css={{ maxWidth: '100%', height: 'auto' }}
    >
      {/* The whole source frame, dimmed: everything outside the kept region is what goes away. */}
      <rect
        x={0}
        y={0}
        width={frameWidth}
        height={frameHeight}
        fill={theme.colors.surfaceStrong}
        stroke={theme.colors.border}
        strokeWidth={1}
      />
      <rect
        x={crop.x * frameWidth}
        y={crop.y * frameHeight}
        width={crop.width * frameWidth}
        height={crop.height * frameHeight}
        fill={theme.colors.accent}
        fillOpacity={0.22}
        stroke={theme.colors.accent}
        strokeWidth={2}
      />
    </svg>
  );
};

/**
 * The Project snapshot does not carry source dimensions. In that case this shows the selected
 * output shape without inventing a crop percentage; the adjacent copy states that the center is
 * kept and leaves the exact amount to the measured render path.
 */
const PlacementShapePreview = ({ aspect }: { readonly aspect: ProjectExportAspect }) => {
  const theme = useTheme();
  const ratio = PLACEMENT_ASPECT_RATIOS[aspect];
  const maximumWidth = 198;
  const maximumHeight = 104;
  const width = Math.min(maximumWidth, maximumHeight * ratio);
  const height = width / ratio;
  const x = (PREVIEW_WIDTH - width) / 2;
  const y = (PREVIEW_HEIGHT - height) / 2;

  return (
    <svg
      role="presentation"
      aria-hidden="true"
      width={PREVIEW_WIDTH}
      height={PREVIEW_HEIGHT}
      viewBox={`0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}`}
      css={{ maxWidth: '100%', height: 'auto' }}
    >
      <rect
        x={0.5}
        y={0.5}
        width={PREVIEW_WIDTH - 1}
        height={PREVIEW_HEIGHT - 1}
        fill={theme.colors.surfaceStrong}
        stroke={theme.colors.border}
      />
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={theme.colors.accent}
        fillOpacity={0.22}
        stroke={theme.colors.accent}
        strokeWidth={2}
      />
    </svg>
  );
};

export interface ExportPlacementChooserProps {
  readonly value: ProjectExportSpecification | null;
  /**
   * The media the placement applies to, when it has been measured. Absent, the chooser still works
   * and describes the result without claiming a crop amount it cannot know.
   */
  readonly source?: VideoEditSourceGeometry | null;
  /**
   * Where the cut's burned-in subtitles sit, when it has any, so the description can say whether
   * a shape keeps them. Absent or empty, nothing is said about subtitles.
   */
  readonly subtitlePlacements?: readonly SubtitleCuePlacement[];
  readonly disabled?: boolean;
  /**
   * Whether the browser can re-frame, `null` while its probe is still running. Given whole rather
   * than as two derived booleans, because deciding what waiting looks like is this component's
   * job: unknown is inert, not unavailable, and a chooser that says a browser cannot re-frame and
   * then takes it back a tick later is worse than one that waits.
   */
  readonly supported?: boolean | null;
  readonly onChange: (specification: ProjectExportSpecification | null) => void;
}

/**
 * The one place a placement is chosen — shared by the Project save step and the standalone save —
 * so both offer the same destinations, the same wording and the same degradation.
 */
export const ExportPlacementChooser = ({
  value,
  source = null,
  subtitlePlacements = [],
  disabled = false,
  supported = true,
  onChange,
}: ExportPlacementChooserProps) => {
  const theme = useTheme();
  const unavailable = supported === false;
  const inert = disabled || supported === null;
  /*
   * Withdrawn on screen only. Calling `onChange(null)` here looked like making the state agree with
   * the display, but one of the three callers persists that value: it would erase the operator's
   * stored placement on the server, attributed to them and gone from their other devices, because
   * of a capability answer on this one browser. The recorded placement stays; the save path asks
   * the capability itself and stores the cut in its own shape when the answer is no.
   */
  const aspect: ProjectExportAspect = unavailable ? 'source' : (value?.aspect ?? 'source');
  const active = unavailable ? null : value;

  return (
    <div css={chooserStyles(theme)} data-export-placement-chooser="">
      <div>
        <p css={{ margin: 0, fontWeight: 700 }}>Where is this going?</p>
        <p css={{ margin: 0, fontSize: '0.85rem', color: theme.colors.textMuted }}>
          Choose the shape that fits where people will watch it.
        </p>
      </div>
      <div data-placement-segments="">
        <SegmentedControl
          label="Where is this going?"
          value={aspect}
          options={SEGMENTS}
          disabled={inert || unavailable}
          onChange={(next) => onChange(projectExportSpecificationForAspect(next))}
        />
      </div>
      <p css={{ margin: 0, fontSize: '0.85rem' }}>{exportPlacementHint(aspect)}</p>
      {unavailable ? (
        <StatusNotice tone="warning" title="Local editor unavailable">
          This browser cannot provide the required WebGL, WebCodecs, worker, and OffscreenCanvas
          path, so a video cannot be re-framed here. Your video keeps its original shape and can
          still be saved.
        </StatusNotice>
      ) : null}
      {active !== null ? (
        <div css={previewStyles(theme)}>
          {source === null ? (
            <PlacementShapePreview aspect={active.aspect} />
          ) : (
            <CropPreview specification={active} source={source} />
          )}
          <strong css={{ fontSize: theme.fontSizes.metadata }}>
            {exportPlacementLabel(active.aspect)}
          </strong>
          <p css={{ margin: 0, fontSize: '0.85rem', textAlign: 'center' }}>
            {exportPlacementDescription(active, source, subtitlePlacements)}
          </p>
        </div>
      ) : null}
    </div>
  );
};
