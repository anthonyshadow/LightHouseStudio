import { useId } from 'react';
import { useTheme } from '@emotion/react';
import {
  noticeActionStyles,
  noticeCopyStyles,
  noticeDismissStyles,
  noticeLayerStyles,
  noticeStyles,
} from './MediaStage.styles';
import { deriveStageNotices, type StageNotice } from './stageNotices';

export type StageNoticeLayerProps = {
  notices: readonly StageNotice[];
};

const CloseIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
    <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeLinecap="round" />
  </svg>
);

export const StageNoticeLayer = ({ notices }: StageNoticeLayerProps) => {
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
              <CloseIcon />
            </button>
          ) : null}
        </section>
      ))}
    </div>
  );
};
