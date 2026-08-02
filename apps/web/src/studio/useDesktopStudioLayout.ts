import { useEffect, useState } from 'react';

export const DESKTOP_STUDIO_LAYOUT_QUERY = '(min-width: 64rem)';

const desktopLayoutMatches = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia(DESKTOP_STUDIO_LAYOUT_QUERY).matches;

export const useDesktopStudioLayout = (): boolean => {
  const [desktop, setDesktop] = useState(desktopLayoutMatches);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mediaQuery = window.matchMedia(DESKTOP_STUDIO_LAYOUT_QUERY);
    const update = () => setDesktop(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  return desktop;
};
