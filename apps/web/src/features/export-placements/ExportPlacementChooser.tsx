import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import {
  projectExportPreview,
  projectExportSpecificationForAspect,
  type ProjectExportAspect,
  type ProjectExportSpecification,
  type VideoEditSourceGeometry,
} from '@studio/domain';
import { SegmentedControl, StatusNotice } from '../../ui';
import {
  EXPORT_PLACEMENT_OPTIONS,
  exportPlacementDescription,
  exportPlacementHint,
} from './placements';

const PREVIEW_WIDTH = 220;
const PREVIEW_HEIGHT = 124;

const SEGMENTS = EXPORT_PLACEMENT_OPTIONS.map(({ aspect, label, shortLabel }) => ({
  value: aspect,
  label,
  shortLabel,
}));

const previewStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  justifyItems: 'center',
  gap: theme.space.xs,
  padding: theme.space.sm,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.canvasRaised,
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

export interface ExportPlacementChooserProps {
  readonly value: ProjectExportSpecification | null;
  /**
   * The media the placement applies to, when it has been measured. Absent, the chooser still works
   * and describes the result without claiming a crop amount it cannot know.
   */
  readonly source?: VideoEditSourceGeometry | null;
  readonly disabled?: boolean;
  /** Set when the browser cannot render, which forces and explains the original shape. */
  readonly unavailable?: boolean;
  readonly onChange: (specification: ProjectExportSpecification | null) => void;
}

/**
 * The one place a placement is chosen — shared by the Project save step and the standalone save —
 * so both offer the same destinations, the same wording and the same degradation.
 */
export const ExportPlacementChooser = ({
  value,
  source = null,
  disabled = false,
  unavailable = false,
  onChange,
}: ExportPlacementChooserProps) => {
  const theme = useTheme();
  const aspect: ProjectExportAspect = unavailable ? 'source' : (value?.aspect ?? 'source');
  const active = unavailable ? null : value;

  return (
    <div css={{ display: 'grid', gap: theme.space.sm }}>
      <div>
        <p css={{ margin: 0, fontWeight: 700 }}>Where is this going?</p>
        <p css={{ margin: 0, fontSize: '0.85rem', color: theme.colors.textMuted }}>
          Choosing a destination re-frames the video for it. Keeping it as it is changes nothing.
        </p>
      </div>
      <SegmentedControl
        label="Where is this going?"
        value={aspect}
        options={SEGMENTS}
        disabled={disabled || unavailable}
        onChange={(next) => onChange(projectExportSpecificationForAspect(next))}
      />
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
          {source === null ? null : <CropPreview specification={active} source={source} />}
          <p css={{ margin: 0, fontSize: '0.85rem', textAlign: 'center' }}>
            {exportPlacementDescription(active, source)}
          </p>
        </div>
      ) : null}
    </div>
  );
};
