import { useTheme } from '@emotion/react';
import {
  toolCardStyles,
  toolGroupsStyles,
  toolGroupStyles,
  toolStatusStyles,
} from './ExistingVideoPanel.styles';
import {
  toolForStep,
  toolStatus,
  visualStepHasSettings,
  type ExistingVideoToolId,
} from './existingVideoPresentation';
import type { ExistingVideoWorkflow } from './useExistingVideoWorkflow';
import {
  VIDEO_TRANSFORM_INCOMPATIBLE_REASON,
  VIDEO_TRANSFORM_OPERATION_DESCRIPTIONS,
  VIDEO_TRANSFORM_OPERATION_LABELS,
  VIDEO_TRANSFORM_UNAVAILABLE_REASON,
} from './videoTransformLabels';

type ToolDefinition = Readonly<{
  id: ExistingVideoToolId;
  label: string;
  description: string;
}>;

const tools: readonly ToolDefinition[] = [
  {
    id: 'character',
    label: VIDEO_TRANSFORM_OPERATION_LABELS['character-swap'],
    description: VIDEO_TRANSFORM_OPERATION_DESCRIPTIONS['character-swap'],
  },
  {
    id: 'vton',
    label: VIDEO_TRANSFORM_OPERATION_LABELS['virtual-try-on'],
    description: VIDEO_TRANSFORM_OPERATION_DESCRIPTIONS['virtual-try-on'],
  },
  {
    id: 'voice',
    label: 'Voice',
    description: 'Combine with either visual edit, or use it on its own.',
  },
];

export interface ExistingVideoToolCardsProps {
  readonly workflow: ExistingVideoWorkflow;
  readonly activeTool: ExistingVideoToolId | null;
  readonly locked: boolean;
  /**
   * Why Voice cannot be used here, when something other than the source's audio decides it.
   *
   * A Project is the case: it can hold a voice selection but has no way to start one, so leaving
   * the card live let an operator configure a voice and only meet the refusal at Start — the dead
   * end this was meant to close, one step later.
   */
  readonly voiceUnavailableReason?: string | undefined;
  readonly characterSwapAvailable?: boolean;
  readonly virtualTryOnAvailable?: boolean;
  readonly onSelect: (tool: ExistingVideoToolId, trigger: HTMLButtonElement) => void;
}

export const ExistingVideoToolCards = ({
  workflow,
  activeTool,
  locked,
  voiceUnavailableReason,
  characterSwapAvailable = true,
  virtualTryOnAvailable = true,
  onSelect,
}: ExistingVideoToolCardsProps) => {
  'use memo';

  const theme = useTheme();
  const configuredVisualTool = toolForStep(workflow.steps[0]);
  const viewedVisualTool = activeTool === 'character' || activeTool === 'vton' ? activeTool : null;
  const selectedVisualTool = viewedVisualTool ?? configuredVisualTool;

  const renderTool = (tool: ToolDefinition) => {
    // Stated once so the card's disabled state and its sentence can never disagree about why.
    const voiceBlockedReason =
      tool.id !== 'voice'
        ? null
        : (voiceUnavailableReason ??
          (workflow.voiceAvailable ? null : 'The source has no usable audio.'));
    const unavailable =
      (tool.id === 'voice' && voiceBlockedReason !== null) ||
      (tool.id === 'character' &&
        (!characterSwapAvailable || !workflow.visualProviderCompatibility.compatible)) ||
      (tool.id === 'vton' &&
        (!virtualTryOnAvailable || !workflow.visualProviderCompatibility.compatible));
    const selected =
      tool.id === 'voice'
        ? activeTool === 'voice' || workflow.voiceSelection !== null
        : selectedVisualTool === tool.id;
    const status = toolStatus(tool.id, workflow);
    const descriptionId = `existing-video-tool-${tool.id}-description`;
    const statusId = `existing-video-tool-${tool.id}-status`;
    const description = unavailable
      ? tool.id === 'voice'
        ? voiceBlockedReason
        : !workflow.visualProviderCompatibility.compatible
          ? (workflow.visualProviderCompatibility.reason ?? VIDEO_TRANSFORM_INCOMPATIBLE_REASON)
          : VIDEO_TRANSFORM_UNAVAILABLE_REASON
      : tool.id !== 'voice' &&
          configuredVisualTool &&
          configuredVisualTool !== tool.id &&
          workflow.steps[0] &&
          visualStepHasSettings(workflow.steps[0])
        ? 'Switch visual edits. Existing settings will be cleared after confirmation.'
        : tool.description;
    return (
      <button
        key={tool.id}
        type="button"
        css={toolCardStyles(theme, selected, unavailable)}
        aria-label={tool.label}
        aria-describedby={`${descriptionId} ${statusId}`}
        aria-pressed={selected}
        disabled={locked || unavailable}
        onClick={(event) => onSelect(tool.id, event.currentTarget)}
      >
        <span>
          <strong>{tool.label}</strong>
          <small id={descriptionId}>{description}</small>
        </span>
        <span id={statusId} css={toolStatusStyles(theme, selected)}>
          {unavailable ? 'Unavailable' : status}
        </span>
      </button>
    );
  };

  return (
    <div css={toolGroupsStyles(theme)} aria-label="Editing tools">
      <section css={toolGroupStyles(theme, 2)} aria-labelledby="existing-video-visual-tools-label">
        <p id="existing-video-visual-tools-label">
          <strong>Visual edit</strong> · Choose one
        </p>
        <div>{tools.filter((tool) => tool.id !== 'voice').map(renderTool)}</div>
      </section>
      <section css={toolGroupStyles(theme, 1)} aria-labelledby="existing-video-voice-tool-label">
        <p id="existing-video-voice-tool-label">
          <strong>Voice</strong> · Optional
        </p>
        <div>{tools.filter((tool) => tool.id === 'voice').map(renderTool)}</div>
      </section>
    </div>
  );
};
