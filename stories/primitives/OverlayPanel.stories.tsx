import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, OverlayPanel, TextField } from '@web/ui';
import { StoryColumn, StorySection } from '../support/StoryLayout';

const meta = {
  title: 'Primitives/Overlay Panel',
  component: OverlayPanel,
  args: {
    open: false,
    title: 'Overlay title',
    children: 'Overlay content',
    onClose: () => undefined,
  },
  parameters: {
    docs: {
      description: {
        component:
          'The shared modal surface supports right drawers, bottom sheets, and fullscreen dialogs. It owns focus trapping, Escape and backdrop dismissal, nested overlay isolation, focus return, and reduced-motion exit behavior.',
      },
    },
  },
} satisfies Meta<typeof OverlayPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const OverlayHarness = ({ placement }: { placement: 'right' | 'bottom' | 'fullscreen' }) => {
  const [open, setOpen] = useState(false);
  return (
    <StoryColumn width="42rem">
      <StorySection title={`${placement} overlay`}>
        <Button variant="primary" onClick={() => setOpen(true)}>
          Open {placement} panel
        </Button>
        <OverlayPanel
          open={open}
          placement={placement}
          size={placement === 'fullscreen' ? 'wide' : 'standard'}
          title="Edit recipe"
          description="Changes remain local until you save them."
          footer={
            <>
              <Button variant="quiet" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => setOpen(false)}>
                Save
              </Button>
            </>
          }
          onClose={() => setOpen(false)}
        >
          <TextField label="Recipe name" defaultValue="Editorial portrait" />
        </OverlayPanel>
      </StorySection>
    </StoryColumn>
  );
};

export const RightDrawer: Story = {
  render: () => <OverlayHarness placement="right" />,
};

export const BottomSheet: Story = {
  render: () => <OverlayHarness placement="bottom" />,
};

export const FullscreenDialog: Story = {
  render: () => <OverlayHarness placement="fullscreen" />,
};
