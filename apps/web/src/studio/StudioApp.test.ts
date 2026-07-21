// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { resolveStudioDestination } from './StudioApp';

const location = (pathname: string, search = ''): Pick<Location, 'pathname' | 'search'> => ({
  pathname,
  search,
});

describe('resolveStudioDestination', () => {
  it('opens guided by default for all users and restores a requested project', () => {
    expect(resolveStudioDestination(location('/'), 'all')).toEqual({
      kind: 'guided',
      projectId: null,
      resumeLatest: true,
    });
    expect(resolveStudioDestination(location('/guided/', '?project=project-42'), 'all')).toEqual({
      kind: 'guided',
      projectId: 'project-42',
      resumeLatest: true,
    });
    expect(resolveStudioDestination(location('/', '?new=1'), 'all')).toEqual({
      kind: 'guided',
      projectId: null,
      resumeLatest: false,
    });
  });

  it('keeps Advanced and Projects as explicit destinations', () => {
    expect(resolveStudioDestination(location('/advanced'), 'all')).toEqual({ kind: 'advanced' });
    expect(resolveStudioDestination(location('/projects'), 'all')).toEqual({ kind: 'projects' });
  });

  it('requires an explicit guided entry during opt-in rollout', () => {
    expect(resolveStudioDestination(location('/'), 'opt-in')).toEqual({ kind: 'advanced' });
    expect(resolveStudioDestination(location('/guided'), 'opt-in')).toEqual({
      kind: 'guided',
      projectId: null,
      resumeLatest: true,
    });
    expect(
      resolveStudioDestination(location('/', '?characterFlow=guided&project=resume-me'), 'opt-in'),
    ).toEqual({ kind: 'guided', projectId: 'resume-me', resumeLatest: true });
  });

  it('routes every non-Advanced entry to Advanced when rollout is off', () => {
    expect(resolveStudioDestination(location('/'), 'off')).toEqual({ kind: 'advanced' });
    expect(resolveStudioDestination(location('/guided'), 'off')).toEqual({ kind: 'advanced' });
    expect(resolveStudioDestination(location('/projects'), 'off')).toEqual({ kind: 'advanced' });
  });
});
