import type { ProjectProcessingAttempt } from '@studio/contracts';
import { describe, expect, it } from 'vitest';
import { projectProcessingDetail, projectProcessingTitle } from './projectProcessingPresentation';

const attempt = {
  capability: 'virtual-try-on',
  phase: 'complete',
  result: { historical: false },
} as ProjectProcessingAttempt;

describe('Project processing presentation', () => {
  it('describes current completion as retained working media rather than Project completion', () => {
    expect(projectProcessingTitle(attempt)).toBe('Result ready');
    expect(projectProcessingDetail(attempt)).toContain('durable working media');
    expect(projectProcessingDetail(attempt)).toContain('remains Ready');
  });

  it('describes stale success as retained without promotion or output-version claims', () => {
    const historical = {
      ...attempt,
      result: { historical: true },
    } as ProjectProcessingAttempt;
    expect(projectProcessingTitle(historical)).toBe('Retained in this Project');
    expect(projectProcessingDetail(historical)).toContain('did not replace the current media');
    expect(projectProcessingDetail(historical)).toContain('saved Video Version');
  });

  it('distinguishes browser switching from accepted remote cancellation', () => {
    const accepted = {
      ...attempt,
      phase: 'accepted',
      result: null,
    } as ProjectProcessingAttempt;
    expect(projectProcessingDetail(accepted)).toContain(
      'Switching Projects stops only browser status checks',
    );
    expect(projectProcessingDetail(accepted)).toContain('accepted remote work may continue');
  });
});
