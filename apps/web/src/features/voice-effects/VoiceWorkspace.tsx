import { useId, useMemo, useState } from 'react';
import { useTheme } from '@emotion/react';
import type { VoiceSummary } from '@studio/contracts';
import { Button, StatusNotice } from '../../ui';
import type { VoiceEffectSelection } from './types';
import { LOCAL_EFFECTS } from './types';
import { VoiceLibrary } from './VoiceLibrary';
import {
  compatibilityStyles,
  selectionHeadingStyles,
  selectionPanelStyles,
  sourceSummaryStyles,
  statusStackStyles,
  treatmentChoiceStyles,
  treatmentListStyles,
  treatmentRailStyles,
  workspaceBodyStyles,
  workspaceContentStyles,
  workspaceFooterStyles,
  workspaceHeaderStyles,
  workspaceStyles,
} from './VoiceWorkspace.styles';

export type VoiceWorkspaceMode = 'apply' | 'select';

export type VoiceWorkspaceProps = {
  mode: VoiceWorkspaceMode;
  committedSelection: VoiceEffectSelection;
  hasAudio: boolean;
  canReplaceAudio: boolean;
  canRenderLocalEffects: boolean;
  elevenLabsAvailable: boolean;
  elevenLabsModel?: string | null;
  elevenLabsDurationSupported: boolean;
  clipDurationLabel: string;
  locked?: boolean;
  processingActive?: boolean;
  processingError?: string | null;
  treatmentReady?: boolean;
  embedded?: boolean;
  heading?: string;
  onCommitOriginal: () => void;
  onCommitLocal: (effect: (typeof LOCAL_EFFECTS)[number]) => void;
  onCommitVoice: (voice: VoiceSummary) => void;
  onCancelProcessing?: () => void;
};

const selectionKey = (selection: VoiceEffectSelection): string => {
  if (selection.kind === 'none') return 'original';
  if (selection.kind === 'local') return `local:${selection.effect}`;
  return `elevenlabs:${selection.voiceId}`;
};

const selectionName = (selection: VoiceEffectSelection): string => {
  if (selection.kind === 'none') return 'Original';
  if (selection.kind === 'elevenlabs') return selection.voiceName;
  return LOCAL_EFFECTS.find((effect) => effect.id === selection.effect)?.name ?? 'Local treatment';
};

const selectionDescription = (selection: VoiceEffectSelection): string => {
  if (selection.kind === 'none')
    return 'No processing. The immutable captured audio remains active.';
  if (selection.kind === 'elevenlabs')
    return 'Preview the saved provider sample before deciding whether to use this voice.';
  return (
    LOCAL_EFFECTS.find((effect) => effect.id === selection.effect)?.description ??
    'Rendered locally in this browser.'
  );
};

const selectionKindLabel = (selection: VoiceEffectSelection): string => {
  if (selection.kind === 'none') return 'Original audio';
  if (selection.kind === 'elevenlabs') return 'Saved AI Voice';
  return 'Local effect';
};

const selectionMark = (selection: VoiceEffectSelection): string => {
  if (selection.kind === 'none') return '◉';
  if (selection.kind === 'elevenlabs') return '✦';
  if (selection.effect === 'warm-studio') return '≈';
  if (selection.effect === 'clear-presenter') return '◇';
  return '⌁';
};

export const VoiceWorkspace = ({
  mode,
  committedSelection,
  hasAudio,
  canReplaceAudio,
  canRenderLocalEffects,
  elevenLabsAvailable,
  elevenLabsModel = null,
  elevenLabsDurationSupported,
  clipDurationLabel,
  locked = false,
  processingActive = false,
  processingError = null,
  treatmentReady = false,
  embedded = false,
  heading = mode === 'apply' ? 'Voice Treatments' : 'Configure Voice',
  onCommitOriginal,
  onCommitLocal,
  onCommitVoice,
  onCancelProcessing,
}: VoiceWorkspaceProps) => {
  const theme = useTheme();
  const disclosureId = useId();
  const committedKey = selectionKey(committedSelection);
  const [draftSelection, setDraftSelection] = useState<VoiceEffectSelection>(committedSelection);
  const [draftVoice, setDraftVoice] = useState<VoiceSummary | null>(null);
  const [lastCommittedKey, setLastCommittedKey] = useState(committedKey);
  const [activeView, setActiveView] = useState<'treatments' | 'library'>(
    committedSelection.kind === 'elevenlabs' ? 'library' : 'treatments',
  );
  const [libraryStarted, setLibraryStarted] = useState(committedSelection.kind === 'elevenlabs');

  if (lastCommittedKey !== committedKey) {
    setLastCommittedKey(committedKey);
    if (selectionKey(draftSelection) !== committedKey) {
      setDraftSelection(committedSelection);
      setDraftVoice(null);
      setActiveView(committedSelection.kind === 'elevenlabs' ? 'library' : 'treatments');
      if (committedSelection.kind === 'elevenlabs') setLibraryStarted(true);
    }
  }

  const draftKey = selectionKey(draftSelection);
  const draftName = selectionName(draftSelection);
  const draftDescription = selectionDescription(draftSelection);
  const draftKindLabel = selectionKindLabel(draftSelection);
  const selectionCommitted = draftKey === committedKey;
  const localSelection =
    draftSelection.kind === 'local'
      ? LOCAL_EFFECTS.find((effect) => effect.id === draftSelection.effect)
      : null;

  const action = useMemo(() => {
    if (draftSelection.kind === 'none') {
      return {
        label:
          mode === 'select'
            ? selectionCommitted
              ? 'Original audio selected'
              : 'Use original audio'
            : selectionCommitted
              ? 'Original audio active'
              : 'Restore original audio',
        disabled: selectionCommitted,
        commit: onCommitOriginal,
      };
    }
    if (draftSelection.kind === 'local' && localSelection) {
      return {
        label:
          mode === 'select'
            ? selectionCommitted
              ? 'Treatment selected'
              : 'Use this treatment for the edit'
            : selectionCommitted
              ? 'Treatment applied'
              : 'Apply treatment',
        disabled: selectionCommitted || !hasAudio || !canRenderLocalEffects,
        commit: () => onCommitLocal(localSelection),
      };
    }
    if (draftSelection.kind === 'elevenlabs') {
      return {
        label:
          mode === 'select'
            ? selectionCommitted
              ? 'Voice selected'
              : 'Use this voice for the edit'
            : selectionCommitted
              ? 'Treatment applied'
              : 'Apply treatment',
        disabled: selectionCommitted || !draftVoice || !hasAudio || !canReplaceAudio,
        commit: () => {
          if (draftVoice) onCommitVoice(draftVoice);
        },
      };
    }
    return null;
  }, [
    canRenderLocalEffects,
    canReplaceAudio,
    draftSelection,
    draftVoice,
    hasAudio,
    localSelection,
    mode,
    onCommitLocal,
    onCommitOriginal,
    onCommitVoice,
    selectionCommitted,
  ]);

  const chooseSelection = (selection: VoiceEffectSelection) => {
    setActiveView('treatments');
    setDraftSelection(selection);
    setDraftVoice(null);
  };

  const openLibrary = () => {
    setLibraryStarted(true);
    setActiveView('library');
  };

  const savedVoiceAvailable = elevenLabsAvailable && elevenLabsDurationSupported;
  const savedVoiceActive = activeView === 'library';

  return (
    <section
      aria-label={embedded ? heading : 'Voice treatments workspace'}
      css={workspaceStyles(theme, embedded)}
    >
      {embedded ? (
        <header css={workspaceHeaderStyles(theme)}>
          <div>
            <h3>{heading}</h3>
            <p>Every choice starts from Original audio—not a previously processed result.</p>
          </div>
          <span>Optional</span>
        </header>
      ) : null}

      <div css={workspaceBodyStyles(theme, embedded)}>
        <aside aria-label="Voice treatment choices" css={treatmentRailStyles(theme)}>
          <h3>Select Treatment</h3>
          <ul css={treatmentListStyles(theme)}>
            <li>
              <button
                type="button"
                aria-label={mode === 'select' ? 'No voice' : 'Original'}
                aria-pressed={activeView === 'treatments' && draftSelection.kind === 'none'}
                css={treatmentChoiceStyles(
                  theme,
                  activeView === 'treatments' && draftSelection.kind === 'none',
                )}
                disabled={locked}
                onClick={() => {
                  chooseSelection({ kind: 'none' });
                  if (processingActive) onCommitOriginal();
                }}
              >
                <span data-choice-mark aria-hidden="true">
                  ◉
                </span>
                <span>
                  <strong>{mode === 'select' ? 'No voice' : 'Original'}</strong>
                  <small>No processing</small>
                </span>
              </button>
            </li>
            <li>
              <button
                type="button"
                aria-label={
                  !elevenLabsAvailable
                    ? 'Saved AI Voice · provider unavailable'
                    : !elevenLabsDurationSupported
                      ? 'Saved AI Voice · unavailable for clips longer than 5:00'
                      : 'Saved AI Voice · contacts ElevenLabs'
                }
                aria-pressed={savedVoiceActive}
                css={treatmentChoiceStyles(theme, savedVoiceActive)}
                disabled={locked || !savedVoiceAvailable}
                onClick={openLibrary}
              >
                <span data-choice-mark aria-hidden="true">
                  ✦
                </span>
                <span>
                  <strong>Saved AI Voice</strong>
                  <small>
                    {!elevenLabsAvailable
                      ? 'Provider unavailable'
                      : !elevenLabsDurationSupported
                        ? 'Clip exceeds the 5:00 limit'
                        : draftSelection.kind === 'elevenlabs'
                          ? `${draftSelection.voiceName} selected`
                          : 'Contacts ElevenLabs on open'}
                  </small>
                </span>
              </button>
            </li>
            {LOCAL_EFFECTS.map((effect) => {
              const selected =
                activeView === 'treatments' &&
                draftSelection.kind === 'local' &&
                draftSelection.effect === effect.id;
              return (
                <li key={effect.id}>
                  <button
                    type="button"
                    aria-label={effect.name}
                    aria-pressed={selected}
                    css={treatmentChoiceStyles(theme, selected)}
                    disabled={locked || processingActive || !hasAudio || !canRenderLocalEffects}
                    onClick={() => chooseSelection({ kind: 'local', effect: effect.id })}
                  >
                    <span data-choice-mark aria-hidden="true">
                      {effect.id === 'warm-studio'
                        ? '≈'
                        : effect.id === 'clear-presenter'
                          ? '◇'
                          : '⌁'}
                    </span>
                    <span>
                      <strong>{effect.name}</strong>
                      <small>Local effect</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <details css={compatibilityStyles(theme)}>
            <summary>ⓘ Compatibility &amp; Help</summary>
            <p>
              Local effects use browser audio rendering. AI voices require ElevenLabs. Original
              audio is never overwritten.
            </p>
          </details>
        </aside>

        <div css={workspaceContentStyles(theme, embedded)}>
          {activeView === 'treatments' ? (
            <div css={selectionPanelStyles(theme)}>
              <div css={selectionHeadingStyles(theme)}>
                <div>
                  <h4>{draftName}</h4>
                  <p>{draftDescription}</p>
                </div>
                {selectionCommitted ? (
                  <span>{mode === 'apply' ? 'Applied' : 'Selected'}</span>
                ) : null}
              </div>

              <div css={sourceSummaryStyles(theme)}>
                <span data-source-mark aria-hidden="true">
                  {selectionMark(draftSelection)}
                </span>
                <div>
                  <strong>{draftName}</strong>
                  <p>
                    {draftSelection.kind === 'local'
                      ? mode === 'select'
                        ? 'Plan-only until the outer Start edit action renders this treatment locally.'
                        : 'Rendered locally from the immutable Original audio sidecar after Apply.'
                      : draftSelection.kind === 'none'
                        ? 'Ready immediately without rendering or provider contact.'
                        : 'Open the Saved Voices Library to preview the provider sample.'}
                  </p>
                  <small>Source · Original audio · {clipDurationLabel}</small>
                </div>
              </div>

              <div css={statusStackStyles(theme)}>
                {!hasAudio ? (
                  <StatusNotice role="status" aria-live="polite" tone="warning">
                    This source has no usable audio. Original video remains available.
                  </StatusNotice>
                ) : !canReplaceAudio ? (
                  <StatusNotice role="status" tone="warning" title="Voice unavailable">
                    This browser cannot replace audio. Original video remains available.
                  </StatusNotice>
                ) : !canRenderLocalEffects ? (
                  <StatusNotice role="status" tone="warning" title="Local effects unavailable">
                    Saved AI Voice can still be used when ElevenLabs is available.
                  </StatusNotice>
                ) : null}
                {processingActive ? (
                  <StatusNotice role="status" aria-live="polite" title="Rendering treatment…">
                    Playback and download remain locked until a complete replacement is ready.
                    {onCancelProcessing ? (
                      <Button size="small" variant="quiet" onClick={onCancelProcessing}>
                        Cancel processing
                      </Button>
                    ) : null}
                  </StatusNotice>
                ) : null}
                {processingError ? (
                  <StatusNotice role="alert" tone="danger">
                    {processingError}
                  </StatusNotice>
                ) : null}
                {treatmentReady ? (
                  <StatusNotice role="status" aria-live="polite" tone="success">
                    Voice treatment ready. Playback and download are available.
                  </StatusNotice>
                ) : null}
              </div>
            </div>
          ) : libraryStarted ? (
            <VoiceLibrary
              disabled={locked || processingActive}
              selectedVoiceId={draftSelection.kind === 'elevenlabs' ? draftSelection.voiceId : null}
              onSelect={(voice) => {
                setDraftVoice(voice);
                setDraftSelection({
                  kind: 'elevenlabs',
                  voiceId: voice.voiceId,
                  voiceName: voice.name,
                });
              }}
            />
          ) : null}
        </div>
      </div>

      {action ? (
        <footer css={workspaceFooterStyles(theme, embedded)}>
          <div data-footer-selection>
            <span data-footer-mark aria-hidden="true">
              {selectionMark(draftSelection)}
            </span>
            <div>
              <p data-footer-kicker>Currently selected</p>
              <p data-footer-name>
                {draftName} <span>· {draftKindLabel}</span>
              </p>
            </div>
          </div>
          <div data-footer-actions>
            <div id={disclosureId} data-footer-disclosure>
              {draftSelection.kind === 'elevenlabs' ? (
                mode === 'select' ? (
                  <>
                    <span>
                      Nothing is uploaded now. Start edit sends only {clipDurationLabel} of Original
                      audio{elevenLabsModel ? ` using ${elevenLabsModel}` : ''}.
                    </span>
                    <strong>May consume provider credits · zero-retention required</strong>
                  </>
                ) : (
                  <>
                    <span>
                      Applying sends {clipDurationLabel} of the immutable Original audio sidecar
                      {elevenLabsModel ? ` using ${elevenLabsModel}` : ''}.
                    </span>
                    <strong>May consume provider credits · zero-retention required</strong>
                  </>
                )
              ) : draftSelection.kind === 'local' ? (
                <span>Runs locally in this browser. No provider transfer.</span>
              ) : (
                <span>Original audio is restored without provider contact.</span>
              )}
            </div>
            <Button
              data-footer-primary=""
              variant="primary"
              busy={processingActive}
              disabled={locked || processingActive || action.disabled}
              aria-describedby={draftSelection.kind === 'elevenlabs' ? disclosureId : undefined}
              onClick={action.commit}
            >
              {action.label}
            </Button>
          </div>
        </footer>
      ) : null}
    </section>
  );
};
