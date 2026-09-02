import { useRef, useState } from 'react';
import { OverlayPanel } from '../../ui';
import { ActionMenu } from '../../ui/primitives/ActionMenu';
import { CreativeLibraryPortability } from './CreativeLibraryPortability';
import type { CreativeAssetRepository, CreativeAssetStore } from './types';
import type { CreativeLibraryMirror } from './useCreativeLibraryCloudSync';

interface CreativeLibraryManagementMenuProps {
  readonly repository: CreativeAssetRepository;
  readonly store: CreativeAssetStore;
  readonly mirror: CreativeLibraryMirror;
}

/** Keeps whole-library replacement behind the same dismissible overflow used by item actions. */
export const CreativeLibraryManagementMenu = ({
  repository,
  store,
  mirror,
}: CreativeLibraryManagementMenuProps) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  return (
    <>
      <ActionMenu
        label="Creative library actions"
        items={[
          {
            id: 'library-data',
            label: 'Export or import library',
            description: 'Manage a portable backup of Characters, Outfits, variants and prompts.',
            onSelect: (trigger) => {
              triggerRef.current = trigger;
              setOpen(true);
            },
          },
        ]}
      />
      <OverlayPanel
        open={open}
        onClose={() => setOpen(false)}
        title="Library backup"
        description="Export a backup of your Library, or replace it from a Lightframe file."
        placement="bottom"
        height="tall"
        closeLabel="Close Library backup"
        returnFocusRef={triggerRef}
      >
        <CreativeLibraryPortability repository={repository} store={store} mirror={mirror} />
      </OverlayPanel>
    </>
  );
};
