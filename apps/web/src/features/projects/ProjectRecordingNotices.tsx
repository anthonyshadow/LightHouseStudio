import { StatusNotice } from '../../ui';
import {
  RECORDING_UNSUPPORTED_NOTICE,
  type ProjectRecordingControl,
} from './projectRecordingLaunch';

/**
 * The two sentences a Record control may owe the operator, wherever a Project offers one.
 *
 * The control's *state* already had one owner; its explanation did not, and the explanation is the
 * half with wiring in it — the id on the `<small>` is what the button's `aria-describedby` points
 * at, so a screen reader is told why the control is off rather than finding it dead and unexplained.
 * Kept as two copies of the markup, that pairing had two places to come apart.
 *
 * Rendered as a fragment, so each surface keeps its own idea of where in its actions the sentences
 * belong. It lives apart from the hook because that module is type-imported by the capture runtime,
 * which has no business pulling a component's imports into its graph.
 */
export const ProjectRecordingNotices = ({
  record,
}: {
  readonly record: ProjectRecordingControl;
}) => (
  <>
    {record.describedById === undefined ? null : (
      <small id={record.describedById}>{RECORDING_UNSUPPORTED_NOTICE}</small>
    )}
    {record.refusalMessage === null ? null : (
      <StatusNotice role="alert" tone="warning">
        {record.refusalMessage}
      </StatusNotice>
    )}
  </>
);
