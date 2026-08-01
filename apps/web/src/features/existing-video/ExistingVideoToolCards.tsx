import { useTheme } from '@emotion/react';
import { toolCardStyles, toolGridStyles, toolStatusStyles } from './ExistingVideoPanel.styles';
import { toolForStep, toolStatus, type ExistingVideoToolId } from './existingVideoPresentation';
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
    description: 'Change the visible character.',
  },
  {
    id: 'vton',
    label: 'Virtual Try On',
    description: 'Apply one garment to the subject.',
  },
  {
    id: 'voice',
    label: 'Voice',
    description: 'Use a local effect or saved voice.',
  },
];

export interface ExistingVideoToolCardsProps {
  readonly workflow: ExistingVideoWorkflow;
  readonly activeTool: ExistingVideoToolId | null;
  readonly locked: boolean;
  readonly onSelect: (tool: ExistingVideoToolId) => void;
}

export const ExistingVideoToolCards = ({
  workflow,
  activeTool,
  locked,
  onSelect,
}: ExistingVideoToolCardsProps) => {
  const theme = useTheme();
  const configuredVisualTool = toolForStep(workflow.steps[0]);

  return (
    <div css={toolGridStyles(theme)} aria-label="Editing tools">
      {tools.map((tool) => {
        const unavailable = tool.id === 'voice' && !workflow.voiceAvailable;
        const active = activeTool === tool.id;
        const status = toolStatus(tool.id, workflow);
        const descriptionId = `existing-video-tool-${tool.id}-description`;
        const statusId = `existing-video-tool-${tool.id}-status`;
        const description = unavailable
          ? 'The source has no usable audio.'
          : tool.id !== 'voice' && configuredVisualTool && configuredVisualTool !== tool.id
            ? 'Selecting this replaces the other visual edit.'
            : tool.description;
        return (
          <button
            key={tool.id}
            type="button"
            css={toolCardStyles(theme, active, unavailable)}
            aria-label={tool.label}
            aria-describedby={`${descriptionId} ${statusId}`}
            aria-pressed={active}
            disabled={locked || unavailable}
            onClick={() => onSelect(tool.id)}
          >
            <span>
              <strong>{tool.label}</strong>
              <small id={descriptionId}>{description}</small>
            </span>
            <span id={statusId} css={toolStatusStyles(theme, active)}>
              {status}
            </span>
          </button>
        );
      })}
    </div>
  );
};
