import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SegmentedControl } from '@web/ui';
import { StoryColumn, StorySection } from '../support/StoryLayout';

const options = [
  { value: 'local', label: 'Local Camera', shortLabel: 'Local' },
  { value: 'character', label: 'Character AI', shortLabel: 'Character' },
  { value: 'try-on', label: 'Virtual Try-On', shortLabel: 'Try-On' },
] as const;

const meta = {
  title: 'Primitives/Selection',
  component: SegmentedControl,
  args: {
    label: 'Choose an experience',
    value: 'character',
    options,
    onChange: () => undefined,
  },
  parameters: {
    docs: {
      description: {
        component:
          'SegmentedControl is a generic, responsive single-choice control. Full and short labels switch at the mobile breakpoint while accessible names remain stable.',
      },
    },
  },
} satisfies Meta<typeof SegmentedControl>;

export default meta;
type Story = StoryObj<typeof meta>;

const SelectionHarness = ({ disabled = false }: { disabled?: boolean }) => {
  const [value, setValue] = useState<(typeof options)[number]['value']>('character');
  return (
    <StoryColumn width="42rem">
      <StorySection title="AI experience">
        <SegmentedControl
          label="Choose an experience"
          value={value}
          options={options}
          disabled={disabled}
          onChange={setValue}
        />
        <p aria-live="polite">Selected: {value}</p>
      </StorySection>
    </StoryColumn>
  );
};

export const Interactive: Story = {
  render: () => <SelectionHarness />,
};

export const Disabled: Story = {
  render: () => <SelectionHarness disabled />,
};
