import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { createPromptBuilderDraft } from '@studio/domain';
import {
  CharacterBuilderForm,
  createEmptyGuidedDesign,
} from '@web/features/character-builder/CharacterBuilderForm';
import { CharacterBuilderCoordinator } from '@web/features/character-builder/CharacterBuilderCoordinator';
import { CharacterBuilderPanel } from '@web/features/character-builder/CharacterBuilderPanel';
import { CharacterChoiceDrawer } from '@web/features/character-builder/CharacterChoiceDrawer';
import {
  CharacterDirectionPreview,
  type CharacterDirectionPreviewSelection,
} from '@web/features/character-builder/CharacterDirectionPreview';
import { ConfirmationDialog } from '@web/features/character-builder/ConfirmationDialog';
import {
  DEFAULT_CHARACTER_BUILDER_REFERENCE_OPTIONS,
  ReferenceOptionsFields,
} from '@web/features/character-builder/ReferenceOptionsFields';
import { RegenerationDialog } from '@web/features/character-builder/RegenerationDialog';
import {
  CharacterOptionButton,
  CharacterVisualChoiceSection,
} from '@web/features/character-builder/CharacterVisualChoiceSection';
import { createCharacterBuilderState } from '@web/features/character-builder/machine';
import { Button, StatusNotice } from '@web/ui';
import { StoryColumn, StorySection } from '../../support/StoryLayout';

const meta = {
  title: 'Features/Character Builder/Builder',
  component: CharacterBuilderForm,
  subcomponents: {
    CharacterChoiceDrawer,
    CharacterDirectionPreview,
    ReferenceOptionsFields,
    ConfirmationDialog,
    RegenerationDialog,
    CharacterBuilderPanel,
    CharacterBuilderCoordinator,
    CharacterOptionButton,
    CharacterVisualChoiceSection,
  },
  args: {
    draft: createPromptBuilderDraft('character-transform'),
    design: createEmptyGuidedDesign(),
    onChange: fn(),
  },
  parameters: {
    docs: {
      description: {
        component:
          'The guided character builder exposes visual starters, presentation-aware catalog choices, independent appearance controls, a sticky direction preview, generation settings, and guarded confirmation/regeneration dialogs.',
      },
    },
  },
} satisfies Meta<typeof CharacterBuilderForm>;

export default meta;
type Story = StoryObj<typeof meta>;

const BuilderHarness = () => {
  const [draft, setDraft] = useState(() => createPromptBuilderDraft('character-transform'));
  const [design, setDesign] = useState(createEmptyGuidedDesign);
  return (
    <StoryColumn width="82rem">
      <CharacterBuilderForm
        draft={draft}
        design={design}
        previewStatus="Direction preview ready"
        previewActions={<Button variant="primary">Generate reference</Button>}
        previewSettings={
          <ReferenceOptionsFields
            options={DEFAULT_CHARACTER_BUILDER_REFERENCE_OPTIONS}
            onChange={fn()}
          />
        }
        onChange={(nextDraft, nextDesign) => {
          setDraft(nextDraft);
          setDesign(nextDesign);
        }}
      />
    </StoryColumn>
  );
};

export const GuidedBuilder: Story = {
  render: () => <BuilderHarness />,
};

const panelDraft = createPromptBuilderDraft('character-transform');
const panelDesign = createEmptyGuidedDesign();
const panelState = {
  ...createCharacterBuilderState(
    panelDraft,
    panelDesign,
    DEFAULT_CHARACTER_BUILDER_REFERENCE_OPTIONS,
  ),
  phase: 'editing' as const,
};

export const FullscreenBuilderPanel: Story = {
  render: () => (
    <CharacterBuilderPanel
      open
      state={panelState}
      generationAvailable
      editAvailable
      canSave
      autosaveMessage="Draft changes autosave on this browser."
      onChange={fn()}
      onOptionsChange={fn()}
      onGenerate={fn()}
      onRequestRegeneration={fn()}
      onRegenerate={fn()}
      onCancelRegeneration={fn()}
      onRequestReset={fn()}
      onConfirmReset={fn()}
      onCancelReset={fn()}
      onClose={fn()}
      onSave={fn()}
    />
  ),
};

const previewSelections: CharacterDirectionPreviewSelection[] = [
  { category: 'hair', label: 'Soft natural waves', imageSrc: null },
  { category: 'bodyShape', label: 'Balanced', imageSrc: null },
  { category: 'outfit', label: 'Midnight host jacket', imageSrc: null },
  { category: 'background', label: 'Editorial studio', imageSrc: null, swatch: '#293642' },
];

export const DirectionPreviewStates: Story = {
  render: () => (
    <StoryColumn>
      <CharacterDirectionPreview
        characterLabel="Midnight host"
        profile="woman"
        starterLabel="Editorial host"
        montageSources={[]}
        showMontage={false}
        generated={false}
        stale={false}
        busy
        status="Generating preview…"
        selections={previewSelections}
        summary={['adult', 'late-night culture host', 'cinematic']}
        error={
          <StatusNotice tone="warning">Previous direction artwork remains visible.</StatusNotice>
        }
      />
    </StoryColumn>
  ),
};

const DialogHarness = () => {
  const [dialog, setDialog] = useState<'confirm' | 'regenerate' | null>(null);
  return (
    <StoryColumn width="36rem">
      <StorySection title="Guarded actions">
        <Button onClick={() => setDialog('confirm')}>Open confirmation</Button>
        <Button onClick={() => setDialog('regenerate')}>Open regeneration</Button>
      </StorySection>
      <ConfirmationDialog
        open={dialog === 'confirm'}
        title="Leave character builder?"
        description="Unsaved visual choices will remain in this tab, but no recipe has been created."
        confirmLabel="Leave builder"
        danger
        onCancel={() => setDialog(null)}
        onConfirm={() => setDialog(null)}
      />
      <RegenerationDialog
        open={dialog === 'regenerate'}
        onCancel={() => setDialog(null)}
        onSubmit={() => setDialog(null)}
      />
    </StoryColumn>
  );
};

export const GuardedDialogs: Story = {
  render: () => <DialogHarness />,
};
