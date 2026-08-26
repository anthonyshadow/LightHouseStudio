import { lazy, Suspense, type RefObject } from 'react';
import { OverlayPanel } from '../../ui';

/*
 * The panel is here; its contents are not. Settings is reached from a menu on a surface that lives
 * for the whole session, so an eager import would put the settings graph — and the capture record
 * it reads — into what every authenticated route pays before rendering anything. The `OverlayPanel`
 * itself is already on that path, so keeping the shell eager costs nothing and buys the enter
 * transition and focus wiring on the very first open, rather than a chunk-load later.
 */
const SettingsContent = lazy(() =>
  import('./SettingsContent').then((module) => ({ default: module.SettingsContent })),
);

interface SettingsPanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly ownerUserId: string;
}

/** The preferences this browser keeps for the signed-in operator. */
export const SettingsPanel = ({
  open,
  onClose,
  returnFocusRef,
  ownerUserId,
}: SettingsPanelProps) => (
  <OverlayPanel
    open={open}
    onClose={onClose}
    title="Settings"
    description="Preferences this browser keeps for your account."
    returnFocusRef={returnFocusRef}
    placement="right"
    size="standard"
    closeLabel="Close settings"
  >
    {open ? (
      <Suspense fallback={<p role="status">Loading settings…</p>}>
        <SettingsContent ownerUserId={ownerUserId} />
      </Suspense>
    ) : null}
  </OverlayPanel>
);
