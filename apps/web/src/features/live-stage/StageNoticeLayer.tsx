import { useId } from 'react';
import { useTheme } from '@emotion/react';
import {
  noticeActionStyles,
  noticeCopyStyles,
  noticeDismissStyles,
  noticeLayerStyles,
  noticeProgressStyles,
  noticeStyles,
} from './MediaStage.styles';
import { deriveStageNotices, type StageNotice } from './stageNotices';
import { AppIcon } from '../../ui';

export type StageNoticeLayerProps = {
  notices: readonly StageNotice[];
};

export const StageNoticeLayer = ({ notices }: StageNoticeLayerProps) => {
  'use memo';

  const theme = useTheme();
  const labelId = useId();
  const visibleNotices = deriveStageNotices(notices);

  if (visibleNotices.length === 0) return null;

  return (
    <div css={noticeLayerStyles(theme)} data-stage-notices="true">
      {visibleNotices.map((notice, index) => (
        <section
          key={notice.id}
          css={noticeStyles(theme, notice.severity)}
          role={notice.severity === 'error' ? 'alert' : 'status'}
          aria-live={notice.severity === 'error' ? 'assertive' : 'polite'}
          aria-atomic="true"
          aria-labelledby={`${labelId}-${index}`}
          data-notice-id={notice.id}
          data-notice-severity={notice.severity}
        >
          <span css={noticeCopyStyles}>
            <strong id={`${labelId}-${index}`}>{notice.title}</strong>
            {notice.message ? <span>{notice.message}</span> : null}
            {notice.progress ? (
              // Hidden from the accessibility tree so per-chunk updates never re-announce the
              // atomic live region; the stable title and message carry the announced state.
              <span aria-hidden="true" css={noticeProgressStyles(theme)} data-notice-progress="">
                <progress
                  max={1}
                  {...(notice.progress.value === null ? {} : { value: notice.progress.value })}
                />
                <span>{notice.progress.label}</span>
              </span>
            ) : null}
          </span>

          {notice.action ? (
            <button type="button" css={noticeActionStyles(theme)} onClick={notice.action.onAction}>
              {notice.action.label}
            </button>
          ) : null}

          {notice.onDismiss ? (
            <button
              type="button"
              css={noticeDismissStyles(theme)}
              aria-label={`Dismiss ${notice.title}`}
              onClick={notice.onDismiss}
            >
              <AppIcon name="close" />
            </button>
          ) : null}
        </section>
      ))}
    </div>
  );
};
