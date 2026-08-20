import { describe, expect, it } from 'vitest';
import {
  defaultProjectOutputTitle,
  normalizeSavedVideoTitle,
  SAVED_VIDEO_TITLE_MAX_LENGTH,
} from './rules';

describe('normalizeSavedVideoTitle', () => {
  it('collapses whitespace, drops control characters and never yields an empty title', () => {
    expect(normalizeSavedVideoTitle('  Morning  take \n')).toBe('Morning take');
    expect(normalizeSavedVideoTitle('   ')).toBe('Untitled video');
    expect(normalizeSavedVideoTitle('T'.repeat(200))).toHaveLength(SAVED_VIDEO_TITLE_MAX_LENGTH);
  });
});

describe('defaultProjectOutputTitle', () => {
  it('names the change the output was taken from, so two saves never collide', () => {
    expect(defaultProjectOutputTitle({ title: 'Launch cut', currentRevisionNumber: 2 })).toBe(
      'Launch cut · change 2',
    );
    expect(defaultProjectOutputTitle({ title: 'Launch cut', currentRevisionNumber: 3 })).toBe(
      'Launch cut · change 3',
    );
  });

  it('trims the Project title before proposing it', () => {
    expect(defaultProjectOutputTitle({ title: '  Launch cut  ', currentRevisionNumber: 2 })).toBe(
      'Launch cut · change 2',
    );
  });

  it('shortens the Project name rather than the change to stay inside the limit', () => {
    const proposed = defaultProjectOutputTitle({
      title: 'L'.repeat(SAVED_VIDEO_TITLE_MAX_LENGTH),
      currentRevisionNumber: 12,
    });

    expect(proposed).toHaveLength(SAVED_VIDEO_TITLE_MAX_LENGTH);
    expect(proposed.endsWith('… · change 12')).toBe(true);
  });

  it('is a pure function of the Project state, so one state always proposes one name', () => {
    const project = { title: 'Launch cut', currentRevisionNumber: 7 };
    expect(defaultProjectOutputTitle(project)).toBe(defaultProjectOutputTitle(project));
  });
});
