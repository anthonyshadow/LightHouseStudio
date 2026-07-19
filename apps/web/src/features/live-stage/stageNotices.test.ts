import { describe, expect, it, vi } from 'vitest';
import { deriveStageNotices, type StageNotice } from './stageNotices';

const notice = (overrides: Partial<StageNotice> & Pick<StageNotice, 'id'>): StageNotice => ({
  severity: 'info',
  title: overrides.id,
  ...overrides,
});

describe('deriveStageNotices', () => {
  it('deduplicates stable IDs and keeps the more important instance', () => {
    const lowAction = vi.fn();
    const highAction = vi.fn();
    const result = deriveStageNotices([
      notice({
        id: 'camera',
        title: 'Waiting',
        priority: 10,
        action: { label: 'Low', onAction: lowAction },
      }),
      notice({
        id: 'camera',
        title: 'Camera failed',
        severity: 'error',
        priority: 400,
        action: { label: 'Retry', onAction: highAction },
      }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe('Camera failed');
    expect(result[0]?.action?.onAction).toBe(highAction);
  });

  it('sorts deterministically and returns no more than two notices', () => {
    const result = deriveStageNotices([
      notice({ id: 'info', severity: 'info' }),
      notice({ id: 'warning', severity: 'warning' }),
      notice({ id: 'error', severity: 'error' }),
      notice({ id: 'override', severity: 'info', priority: 500 }),
    ]);

    expect(result.map(({ id }) => id)).toEqual(['override', 'error']);
  });

  it('ignores blank IDs and honors an explicit zero limit', () => {
    expect(deriveStageNotices([notice({ id: '   ' })])).toEqual([]);
    expect(deriveStageNotices([notice({ id: 'one' })], 0)).toEqual([]);
  });
});
