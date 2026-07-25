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
          label="Recipe name"
          value={name}
          required
          hint="Used in the local creative shelf."
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
          onChange={(event) => setMode(event.currentTarget.value)}
        >
          <option value="character">Character AI</option>
          <option value="vton">Virtual Try-On</option>
          <option value="local">Local camera</option>
        </SelectField>
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
