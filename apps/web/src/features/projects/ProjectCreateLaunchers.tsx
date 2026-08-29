import { useTheme } from '@emotion/react';
import { Button } from '../../ui';
import {
  createLauncherCardStyles,
  createLauncherGridStyles,
  createLauncherSurfaceStyles,
} from './ProjectCreateTaskPanel.styles';
import {
  type ProjectCreateLauncher,
  type ProjectCreateOperationId,
  type ProjectCreativeResourceKind,
} from './projectCreatePresentation';

const LAUNCH_IN_FLIGHT_REASON = 'Opening the editor…';
const NOT_CHOSEN = 'Not chosen';

interface ProjectCreateLaunchersProps {
  readonly launchers: readonly ProjectCreateLauncher[];
  /** The one operation currently opening the editor, or null. */
  readonly busyOperation: ProjectCreateOperationId | null;
  /**
   * True when one notice above already explains why none of these can act — an archived Project
   * says it once rather than three more times, one per card.
   */
  readonly reasonStatedAbove?: boolean;
  readonly onLaunch: (operation: ProjectCreateOperationId, trigger: HTMLButtonElement) => void;
  readonly onChooseAnother: (kind: ProjectCreativeResourceKind) => void;
}

/**
 * The one place a Project offers to start an edit.
 *
 * Each card carries the creative choice it consumes, so the setup is stated once — beside the thing
 * that uses it — rather than twice, once here and once in a section of its own. None of these
 * submits provider work: the single cost-acknowledged start stays inside the editor, where the
 * operator can see exactly what is about to be sent.
 */
export const ProjectCreateLaunchers = ({
  launchers,
  busyOperation,
  reasonStatedAbove = false,
  onLaunch,
  onChooseAnother,
}: ProjectCreateLaunchersProps) => {
  const theme = useTheme();
  const launching = busyOperation !== null;

  return (
    <section
      data-project-create-launchers=""
      aria-labelledby="project-create-launchers-heading"
      css={createLauncherSurfaceStyles(theme)}
    >
      <header>
        <h3 id="project-create-launchers-heading">Start an edit</h3>
        <p>
          Each of these opens the video editor with this Project’s video already loaded. Nothing is
          sent to a provider until you start it there.
        </p>
      </header>

      <ul css={createLauncherGridStyles(theme)} aria-label="Edits you can start">
        {launchers.map((launcher) => {
          const busy = busyOperation === launcher.id;
          // A launch in flight owns the whole section: a second adoption would race the first for
          // the one stage artifact.
          const waiting = launching && !busy;
          const reason =
            (reasonStatedAbove ? null : launcher.blockedReason) ??
            (waiting ? LAUNCH_IN_FLIGHT_REASON : null);
          const descriptionId = `project-create-${launcher.id}-description`;
          const reasonId = `project-create-${launcher.id}-reason`;
          const input = launcher.input;
          return (
            <li key={launcher.id} data-create-launcher={launcher.id}>
              <article css={createLauncherCardStyles(theme)}>
                {/* Under the section's own h3, so the three edits are navigable as headings. */}
                <h4>{launcher.title}</h4>
                <p id={descriptionId}>{launcher.description}</p>
                {input ? (
                  <div data-create-launcher-input="">
                    <span data-create-launcher-input-label="">{input.label}</span>
                    <span
                      data-create-launcher-input-value=""
                      {...(input.value === null ? { 'data-empty': '' } : {})}
                    >
                      {input.value ?? NOT_CHOSEN}
                    </span>
                    <Button
                      size="small"
                      variant="quiet"
                      aria-label={`Change ${input.label.toLowerCase()}`}
                      onClick={() => onChooseAnother(input.kind)}
                    >
                      Change
                    </Button>
                  </div>
                ) : null}
                {launcher.cost ? <small>{launcher.cost}</small> : null}
                {reason ? (
                  <small id={reasonId} data-create-launcher-blocked="">
                    {reason}
                  </small>
                ) : null}
                <Button
                  variant="primary"
                  busy={busy}
                  disabled={launcher.blockedReason !== null || waiting}
                  // Stated on the control even when the visible line is suppressed, so a greyed
                  // card never leaves the operator to guess — the same treatment the tool rail
                  // gives its own disabled entries.
                  {...(launcher.blockedReason ? { title: launcher.blockedReason } : {})}
                  aria-describedby={reason ? `${descriptionId} ${reasonId}` : descriptionId}
                  onClick={(event) => onLaunch(launcher.id, event.currentTarget)}
                >
                  {launcher.actionLabel}
                </Button>
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
