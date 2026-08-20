import type { CameraPermissionState } from '../../adapters/browser-media/browserMedia';
import type { CaptureDeviceState } from './types';

export type CameraAvailabilityNotice = Readonly<{
  id: 'permission-blocked' | 'permission-pending' | 'no-camera';
  tone: 'warning' | 'neutral';
  title: string;
  body: string;
  /**
   * Whether pressing Start would currently fail. Only these survive collapsing the settings panel:
   * a problem the operator has to fix must not be hidden behind a control they have not opened.
   */
  blocking: boolean;
}>;

const NOTICES: Readonly<Record<CameraAvailabilityNotice['id'], CameraAvailabilityNotice>> = {
  'permission-blocked': {
    id: 'permission-blocked',
    tone: 'warning',
    title: 'Camera permission blocked',
    body: 'Allow camera access in your browser or system settings, then start again.',
    blocking: true,
  },
  'permission-pending': {
    id: 'permission-pending',
    tone: 'neutral',
    title: 'Camera permission not granted',
    body: 'Camera access is requested when you press Start.',
    blocking: false,
  },
  'no-camera': {
    id: 'no-camera',
    tone: 'warning',
    title: 'No camera available',
    body: 'Connect or enable a camera. The list updates on its own.',
    blocking: true,
  },
};

/**
 * What the browser will give the operator when they press Start, and how to say so.
 *
 * One owner for the question because two surfaces ask it: the settings panel explains each notice
 * in full, and the collapsed desktop control keeps the blocking ones visible beside the stage.
 */
export const cameraAvailabilityNotices = ({
  permissionState,
  devicesState,
  cameraCount,
}: {
  readonly permissionState: CameraPermissionState;
  readonly devicesState: CaptureDeviceState;
  readonly cameraCount: number;
}): readonly CameraAvailabilityNotice[] => {
  const notices: CameraAvailabilityNotice[] = [];
  if (permissionState === 'denied') notices.push(NOTICES['permission-blocked']);
  else if (permissionState === 'prompt') notices.push(NOTICES['permission-pending']);
  if (devicesState === 'ready' && cameraCount === 0) notices.push(NOTICES['no-camera']);
  return notices;
};
