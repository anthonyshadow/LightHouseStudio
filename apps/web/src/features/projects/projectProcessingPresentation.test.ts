import type { ProjectProcessingAttempt } from '@studio/contracts';
import { describe, expect, it } from 'vitest';
import { projectProcessingDetail, projectProcessingTitle } from './projectProcessingPresentation';

const attempt = {
  capability: 'virtual-try-on',
  phase: 'complete',
  result: { historical: false },
} as ProjectProcessingAttempt;

describe('Project processing presentation', () => {
  it('describes current completion as the current cut rather than Project completion', () => {
    expect(projectProcessingTitle(attempt)).toBe('Result ready');
    expect(projectProcessingDetail(attempt)).toContain('now the current cut');
    expect(projectProcessingDetail(attempt)).toContain('Saving it as a version is a separate step');
  });

  it('describes stale success as retained without promotion or output-version claims', () => {
    const historical = {
      ...attempt,
      result: { historical: true },
    } as ProjectProcessingAttempt;
    expect(projectProcessingTitle(historical)).toBe('Kept in this Project');
    expect(projectProcessingDetail(historical)).toContain('did not replace what you’re viewing');
    expect(projectProcessingDetail(historical)).toContain('no version was saved');
  });

  it('distinguishes browser switching from accepted remote cancellation', () => {
    const accepted = {
      ...attempt,
      phase: 'accepted',
      result: null,
    } as ProjectProcessingAttempt;
    expect(projectProcessingDetail(accepted)).toContain(
      'Switching Projects stops only the status checks here',
    );
    expect(projectProcessingDetail(accepted)).toContain('accepted work may continue');
  });
});
