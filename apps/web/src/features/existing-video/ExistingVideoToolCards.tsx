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

type ToolDefinition = Readonly<{
  id: ExistingVideoToolId;
  label: string;
  description: string;
}>;

const tools: readonly ToolDefinition[] = [
  {
    id: 'character',
    label: 'Character Swap',
    description: 'Replace the visible person or character.',
  },
  {
    id: 'vton',
    label: 'Virtual Try On',
    description: 'Change the subject’s clothing with one garment.',
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
  readonly characterSwapAvailable?: boolean;
  readonly virtualTryOnAvailable?: boolean;
  readonly onAdjust?: () => void;
  readonly onSelect: (tool: ExistingVideoToolId, trigger: HTMLButtonElement) => void;
}

export const ExistingVideoToolCards = ({
  workflow,
  activeTool,
  locked,
  characterSwapAvailable = true,
  virtualTryOnAvailable = true,
  onAdjust,
  onSelect,
}: ExistingVideoToolCardsProps) => {
  const theme = useTheme();
  const configuredVisualTool = toolForStep(workflow.steps[0]);
  const viewedVisualTool = activeTool === 'character' || activeTool === 'vton' ? activeTool : null;
  const selectedVisualTool = viewedVisualTool ?? configuredVisualTool;

  const renderTool = (tool: ToolDefinition) => {
    const unavailable =
      (tool.id === 'voice' && !workflow.voiceAvailable) ||
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
        ? 'The source has no usable audio.'
        : !workflow.visualProviderCompatibility.compatible
          ? (workflow.visualProviderCompatibility.reason ??
            'This aspect ratio is unavailable for visual AI.')
          : 'This visual operation is unavailable in the current server configuration.'
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
      {onAdjust ? (
        <section css={toolGroupStyles(theme, 1)} aria-labelledby="existing-video-local-tools-label">
          <p id="existing-video-local-tools-label">
            <strong>Local edit</strong> · No provider
          </p>
          <div>
            <button
              type="button"
              css={toolCardStyles(theme, false, false)}
              aria-label="Adjust video"
              disabled={locked}
              onClick={onAdjust}
            >
              <span>
                <strong>Adjust video</strong>
                <small>Trim, crop, rotate, relight, or filter on this device.</small>
              </span>
              <span css={toolStatusStyles(theme, false)}>Local</span>
            </button>
          </div>
        </section>
      ) : null}
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
