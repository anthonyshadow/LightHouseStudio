import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SelectField, TextAreaField, TextField } from '@web/ui';
import { StoryColumn, StorySection } from '../support/StoryLayout';

const meta = {
  title: 'Primitives/Form Controls',
  component: TextField,
  subcomponents: { TextAreaField, SelectField },
  args: {
    label: 'Field label',
  },
  parameters: {
    docs: {
      description: {
        component:
          'Accessible labeled fields share hint, required, error, disabled, and focus treatments. The story keeps values controlled to demonstrate production behavior.',
      },
    },
  },
} satisfies Meta<typeof TextField>;

export default meta;
type Story = StoryObj<typeof meta>;

const FormHarness = () => {
  const [name, setName] = useState('Nova');
  const [direction, setDirection] = useState('');
  const [mode, setMode] = useState('character');
  return (
    <StoryColumn width="38rem">
      <StorySection title="Field set">
        <TextField
          label="Asset name"
          value={name}
          required
          hint="Used in the local creative library."
          onChange={(event) => setName(event.currentTarget.value)}
        />
        <TextAreaField
          label="Creative direction"
          value={direction}
          placeholder="Describe the intended transformation"
          error={
            direction.length > 0 && direction.length < 8 ? 'Add a little more detail.' : undefined
          }
          onChange={(event) => setDirection(event.currentTarget.value)}
        />
        <SelectField
          label="Experience"
          value={mode}
          options={[
            {
              value: 'character',
              label: 'Character AI',
              description: 'Transform the live or recorded character.',
            },
            {
              value: 'vton',
              label: 'Virtual Try-On',
              description: 'Apply a saved outfit or reference garment.',
            },
            {
              value: 'local',
              label: 'Local camera',
              description: 'Record without an AI provider.',
            },
          ]}
          hint="Opens as an anchored list on larger screens and a touch sheet on phones."
          onValueChange={setMode}
        />
        <TextField
          label="Unavailable field"
          value="Locked during a live session"
          disabled
          readOnly
        />
      </StorySection>
    </StoryColumn>
  );
};

export const CompleteFieldSet: Story = {
  render: () => <FormHarness />,
};
