import type { ProjectProcessingAttempt } from '@studio/contracts';
import { describe, expect, it } from 'vitest';
import {
  projectProcessingDetail,
  projectProcessingTitle,
  projectProcessingTone,
} from './projectProcessingPresentation';

const attempt = {
  capability: 'virtual-try-on',
  phase: 'complete',
  result: { state: 'current' },
} as ProjectProcessingAttempt;

describe('Project processing presentation', () => {
  it('describes current completion as the current cut rather than Project completion', () => {
    expect(projectProcessingTitle(attempt)).toBe('Result ready');
    expect(projectProcessingDetail(attempt)).toContain('now the current cut');
    expect(projectProcessingDetail(attempt)).toContain('Saving it as a version is a separate step');
  });

  it('reads a result the Project moved past as a fact, not a failure', () => {
    // The operator's own save moves the head, so this is the ordinary end of a successful round.
    const superseded = {
      ...attempt,
      result: { state: 'superseded' },
    } as ProjectProcessingAttempt;
    expect(projectProcessingTitle(superseded)).toBe('Virtual Try-On is in this Project');
    expect(projectProcessingDetail(superseded)).toContain('was applied to the Project');
    expect(projectProcessingDetail(superseded)).not.toContain(
      'did not replace what you’re viewing',
    );
    expect(projectProcessingDetail(superseded)).not.toContain('no version was saved');
    expect(projectProcessingTone(superseded)).toBe('neutral');
  });

  it('keeps the warning for a result that genuinely never became the cut', () => {
    const unapplied = {
      ...attempt,
      result: { state: 'unapplied' },
    } as ProjectProcessingAttempt;
    expect(projectProcessingTitle(unapplied)).toBe('Virtual Try-On result kept, not applied');
    expect(projectProcessingDetail(unapplied)).toContain('kept instead of replacing');
    expect(projectProcessingTone(unapplied)).toBe('warning');
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
