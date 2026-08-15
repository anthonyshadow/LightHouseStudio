import type { ReactNode } from 'react';

export type AppIconName =
  'assets' | 'campaigns' | 'chevronRight' | 'dashboard' | 'info' | 'plus' | 'projects' | 'video';

type AppIconProps = Readonly<{
  name: AppIconName;
  width?: number | string;
  height?: number | string;
  className?: string;
  'data-nav-icon'?: boolean;
  'data-onboarding-icon'?: boolean;
  'data-recent-icon'?: boolean;
}>;

const iconPaths: Record<AppIconName, ReactNode> = {
  assets: (
    <>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
      <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
    </>
  ),
  campaigns: (
    <>
      <path d="m12 2 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 17 9 5 9-5" />
    </>
  ),
  chevronRight: <path d="m9 18 6-6-6-6" />,
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  projects: (
    <>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z" />
    </>
  ),
  video: (
    <>
      <rect x="3" y="5" width="14" height="14" rx="2" />
      <path d="m17 10 4-2v8l-4-2" />
    </>
  ),
};

export const AppIcon = ({
  name,
  width,
  height,
  className,
  'data-nav-icon': dataNavIcon,
  'data-onboarding-icon': dataOnboardingIcon,
  'data-recent-icon': dataRecentIcon,
}: AppIconProps) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...(width === undefined ? {} : { width })}
    {...(height === undefined ? {} : { height })}
    {...(className === undefined ? {} : { className })}
    {...(dataNavIcon === undefined ? {} : { 'data-nav-icon': '' })}
    {...(dataOnboardingIcon === undefined ? {} : { 'data-onboarding-icon': '' })}
    {...(dataRecentIcon === undefined ? {} : { 'data-recent-icon': '' })}
  >
    {iconPaths[name]}
  </svg>
);
