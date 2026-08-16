import { useState } from 'react';
import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import type { VoiceSummary } from '@studio/contracts';
import type { WorkspaceVoiceItem } from '../../application/types';
import {
  Button,
  ConfirmationDialog,
  SegmentedControl,
  SelectField,
  StatusNotice,
  TextField,
  VisuallyHidden,
  type SelectOption,
} from '../../ui';
import { useVoiceLibrary } from '../../orchestration/voice-library/useVoiceLibrary';
import { VoiceList } from './VoiceList';
import { VoicePreview, useVoicePreviewController } from './VoicePreview';

export type VoiceLibraryProps = {
  disabled: boolean;
  onSelect: (voice: VoiceSummary) => void;
  selectedVoiceId?: string | null;
  /** Names the per-voice action for the surface hosting the library. Defaults to "Select". */
  selectLabel?: string;
  /** Explains a `disabled` library instead of leaving every control inert without a reason. */
  unavailableReason?: string | null;
};

const libraryStyles = (): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  alignContent: 'start',
  gap: '0.75rem',
});

const libraryHeaderStyles = (theme: Theme): CSSObject => ({
  position: 'sticky',
  top: `calc(-1 * ${theme.space.lg})`,
  zIndex: 2,
  display: 'grid',
  gridTemplateColumns: 'minmax(13rem, 0.8fr) minmax(16rem, 1.2fr)',
  alignItems: 'end',
  gap: theme.space.md,
  marginBlockStart: `calc(-1 * ${theme.space.lg})`,
  paddingBlock: theme.space.lg,
  borderBlockEnd: `1px solid ${theme.colors.border}`,
  background: theme.colors.canvas,
  '& h4': {
    marginBlockEnd: theme.space.sm,
    fontFamily: theme.type.display,
    fontSize: theme.fontSizes.section,
  },
  '@media (max-width: 48rem)': {
    top: `calc(-1 * ${theme.space.md})`,
    marginBlockStart: `calc(-1 * ${theme.space.md})`,
    paddingBlock: theme.space.md,
  },
  '@media (max-width: 40rem)': {
    position: 'static',
    gridTemplateColumns: 'minmax(0, 1fr)',
    marginBlockStart: 0,
    paddingBlockStart: 0,
  },
});

const controlsStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.sm,
});

const filterDisclosureStyles = (theme: Theme): CSSObject => ({
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.canvasRaised,
  '& summary': {
    minHeight: '2.75rem',
    display: 'flex',
    alignItems: 'center',
    padding: `${theme.space.xs} ${theme.space.md}`,
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.caption,
    fontWeight: 750,
    cursor: 'pointer',
  },
  '& summary:focus-visible': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '2px',
  },
});

const filterGridStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: theme.space.sm,
  padding: `0 ${theme.space.md} ${theme.space.md}`,
  '& [data-filter-wide]': { gridColumn: 'span 2' },
  '@media (max-width: 44rem)': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' },
  '@media (max-width: 28rem)': {
    gridTemplateColumns: 'minmax(0, 1fr)',
    '& [data-filter-wide]': { gridColumn: 'auto' },
  },
});

const safePreviewStyles = (theme: Theme): CSSObject => ({
  color: theme.colors.textMuted,
  fontSize: theme.fontSizes.caption,
  '& strong': { color: theme.colors.accentStrong },
});

const resultsStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  alignContent: 'start',
  gap: theme.space.sm,
});

const pageStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: theme.space.sm,
  paddingBlockStart: theme.space.xs,
  borderBlockStart: `1px solid ${theme.colors.border}`,
  '& p': { color: theme.colors.textMuted, fontSize: theme.fontSizes.caption },
});

const anyOption = (label: string): SelectOption => ({ value: '', label });
const LANGUAGE_OPTIONS: readonly SelectOption[] = [
  anyOption('Any language'),
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'hi', label: 'Hindi' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'zh', label: 'Chinese' },
];
const GENDER_OPTIONS: readonly SelectOption[] = [
  anyOption('Any gender'),
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'neutral', label: 'Neutral' },
];
const AGE_OPTIONS: readonly SelectOption[] = [
  anyOption('Any age'),
  { value: 'young', label: 'Young' },
  { value: 'middle-aged', label: 'Middle-aged' },
  { value: 'old', label: 'Older' },
];
const USE_CASE_OPTIONS: readonly SelectOption[] = [
  anyOption('Any use case'),
  { value: 'narration', label: 'Narration' },
  { value: 'conversational', label: 'Conversational' },
  { value: 'characters_animation', label: 'Characters & animation' },
  { value: 'social_media', label: 'Social media' },
  { value: 'news', label: 'News' },
  { value: 'meditation', label: 'Meditation' },
];
const SORT_OPTIONS: readonly SelectOption[] = [
  { value: 'trending', label: 'Trending' },
  { value: 'created_date', label: 'Newest' },
  { value: 'usage_character_count_1y', label: 'Most used' },
  { value: 'cloned_by_count', label: 'Most saved' },
];

export const VoiceLibrary = ({
  disabled,
  onSelect,
  selectedVoiceId,
  selectLabel,
  unavailableReason,
}: VoiceLibraryProps) => {
  const theme = useTheme();
  const library = useVoiceLibrary();
  const [removeCandidate, setRemoveCandidate] = useState<WorkspaceVoiceItem | null>(null);
  const preview = useVoicePreviewController((item) =>
    library.setError(`The preview for ${item.voice.name} could not be played.`),
  );
  const selected =
    selectedVoiceId !== undefined
      ? selectedVoiceId
        ? (library.voices.find(
            (item): item is WorkspaceVoiceItem =>
              item.kind === 'workspace' && item.voice.voiceId === selectedVoiceId,
          ) ?? (library.selected?.voice.voiceId === selectedVoiceId ? library.selected : null))
        : null
      : library.selected;
  const filtersActive = Object.values(library.criteria).some((value) => value !== '');
  const title = library.tab === 'saved' ? 'Saved Voices' : 'Browse Voices';

  return (
    <div css={libraryStyles()}>
      <header css={libraryHeaderStyles(theme)}>
        <div>
          <h4>{title}</h4>
          <SegmentedControl
            label="Voice library view"
            value={library.tab}
            options={[
              { value: 'saved', label: 'Saved Voices', shortLabel: 'Saved' },
              { value: 'browse', label: 'Browse Voices', shortLabel: 'Browse' },
            ]}
            onChange={library.setTab}
          />
        </div>
        <div css={controlsStyles(theme)}>
          <TextField
            label={`Search ${library.tab === 'saved' ? 'saved voices' : 'the voice catalog'}`}
            value={library.query}
            maxLength={100}
            placeholder="Name, description, label, or category"
            hint={library.searchHint ?? 'Search begins after 3 characters.'}
            onChange={(event) => library.setQuery(event.target.value)}
          />
          {library.tab === 'browse' ? (
            <SelectField
              label="Sort Browse Voices"
              value={library.browseSort}
              options={SORT_OPTIONS}
              onValueChange={(value) => library.setBrowseSort(value as typeof library.browseSort)}
            />
          ) : null}
        </div>
      </header>

      <details css={filterDisclosureStyles(theme)}>
        <summary>Advanced filters{filtersActive ? ' · Active' : ''}</summary>
        <div css={filterGridStyles(theme)}>
          <SelectField
            label="Language"
            value={library.criteria.language}
            options={LANGUAGE_OPTIONS}
            onValueChange={(value) => library.setFilter('language', value)}
          />
          <SelectField
            label="Gender"
            value={library.criteria.gender}
            options={GENDER_OPTIONS}
            onValueChange={(value) => library.setFilter('gender', value)}
          />
          <SelectField
            label="Age"
            value={library.criteria.age}
            options={AGE_OPTIONS}
            onValueChange={(value) => library.setFilter('age', value)}
          />
          <TextField
            label="Accent"
            value={library.criteria.accent}
            maxLength={80}
            placeholder="e.g. American"
            onChange={(event) => library.setFilter('accent', event.target.value)}
          />
          <SelectField
            label="Use case"
            value={library.criteria.useCase}
            options={USE_CASE_OPTIONS}
            onValueChange={(value) => library.setFilter('useCase', value)}
          />
          <div data-filter-wide>
            <TextField
              label="Tone or style"
              value={library.criteria.descriptive}
              maxLength={80}
              placeholder="e.g. warm, calm, dramatic"
              onChange={(event) => library.setFilter('descriptive', event.target.value)}
            />
          </div>
          {filtersActive ? (
            <Button size="small" variant="quiet" onClick={library.clearFilters}>
              Clear filters
            </Button>
          ) : null}
        </div>
      </details>

      <p css={safePreviewStyles(theme)}>
        <strong>Safe preview:</strong> provider sample only—your recording is never uploaded.
      </p>

      <VoicePreview
        item={preview.item}
        objectUrl={preview.objectUrl}
        attachAudio={preview.attachAudio}
        setPlaying={preview.setPlaying}
        reportPlaybackError={preview.reportPlaybackError}
      />
      <VisuallyHidden>
        <span role="status" aria-live="polite" aria-atomic="true">
          {library.announcement}
        </span>
      </VisuallyHidden>

      <div css={resultsStyles(theme)}>
        {disabled && unavailableReason ? (
          <StatusNotice role="status" tone="warning" title="Voice actions unavailable">
            {unavailableReason}
          </StatusNotice>
        ) : null}
        {library.mutationMessage ? (
          <StatusNotice role="status" aria-live="polite" tone="success">
            {library.mutationMessage}
          </StatusNotice>
        ) : null}
        {library.error ? (
          <StatusNotice role="alert" tone="danger">
            {library.error}
            <Button
              size="small"
              variant="quiet"
              onClick={() => {
                library.setError(null);
                library.retry();
              }}
            >
              Retry
            </Button>
          </StatusNotice>
        ) : null}
        {library.loading ? (
          <StatusNotice role="status" aria-live="polite" aria-atomic="true">
            Loading {library.tab === 'saved' ? 'saved voices' : 'voice catalog'}…
          </StatusNotice>
        ) : null}
        {!library.loading && library.voices.length === 0 && !library.error ? (
          <StatusNotice role="status" aria-live="polite">
            {filtersActive
              ? `No ${library.tab === 'saved' ? 'saved' : 'catalog'} voices match these filters.`
              : library.tab === 'saved'
                ? 'No saved voices are available in your Lightframe library.'
                : 'No included-rate voices are available in this catalog page.'}
            {filtersActive ? (
              <Button size="small" variant="quiet" onClick={library.clearFilters}>
                Clear filters
              </Button>
            ) : (
              <Button size="small" variant="quiet" onClick={library.refresh}>
                Refresh
              </Button>
            )}
          </StatusNotice>
        ) : null}

        <VoiceList
          voices={library.voices}
          selected={selected}
          loading={library.loading}
          disabled={disabled}
          {...(selectLabel ? { selectLabel } : {})}
          previewVoiceId={preview.item?.voice.voiceId ?? null}
          previewLoadingVoiceId={preview.loadingVoiceId}
          previewPlaying={preview.playing}
          mutationVoiceId={library.mutationVoiceId}
          onPreview={(item) => void preview.toggle(item)}
          onSelect={(item) => {
            if (item.kind !== 'workspace') return;
            library.setSelected(item);
            onSelect(item.voice);
          }}
          onAdd={(item) => {
            if (item.kind === 'shared') void library.addVoice(item);
          }}
          onRemove={(item) => {
            if (item.kind === 'workspace') setRemoveCandidate(item);
          }}
        />

        {library.voices.length > 0 ? (
          <div css={pageStyles(theme)} aria-label={`${title} navigation`}>
            <Button
              size="small"
              variant="quiet"
              disabled={library.previousDisabled || library.loading}
              onClick={library.previous}
            >
              Previous
            </Button>
            <p>Page {library.pageNumber}</p>
            <Button
              size="small"
              variant="quiet"
              disabled={library.loading}
              onClick={library.refresh}
            >
              Refresh
            </Button>
            <Button
              size="small"
              variant="quiet"
              disabled={!library.hasMore || library.loading}
              onClick={library.next}
            >
              Next
            </Button>
          </div>
        ) : null}
      </div>

      <ConfirmationDialog
        open={removeCandidate !== null}
        title="Remove saved voice?"
        description={
          removeCandidate
            ? `Remove ${removeCandidate.voice.name} from Saved Voices? If its owner withdraws it from the ElevenLabs catalog, you may not be able to add it again.`
            : ''
        }
        confirmLabel="Remove voice"
        cancelLabel="Keep voice"
        danger
        busy={removeCandidate !== null && library.mutationVoiceId === removeCandidate.voice.voiceId}
        onCancel={() => setRemoveCandidate(null)}
        onConfirm={() => {
          if (!removeCandidate) return;
          const candidate = removeCandidate;
          void library.removeVoice(candidate).then(() => setRemoveCandidate(null));
        }}
      />
    </div>
  );
};
