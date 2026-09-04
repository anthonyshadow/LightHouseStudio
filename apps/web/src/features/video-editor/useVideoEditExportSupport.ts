import { useEffect, useState } from 'react';
import { videoEditSupported } from './videoEditSupport';

/**
 * Whether this browser can run the local editor, as a React value.
 *
 * `null` until the probe answers, because answering honestly means asking the encoder to encode.
 * Unknown is neither "offer it" nor "warn about it": a surface that treats it as no flashes a
 * notice at every browser that can edit, and one that treats it as yes offers a control the render
 * may not honour. It resolves within a frame or two and is memoized for the page, so every later
 * caller is free.
 *
 * One owner, because the answer is a property of the browser rather than of any surface, and three
 * surfaces asking it separately is three chances to disagree about what waiting looks like.
 *
 * `enabled` exists because asking is not free the first time: it allocates a 720p frame and runs a
 * real encode. A surface that will never show the answer should not be the one to pay for it.
 */
export const useVideoEditExportSupport = (enabled = true): boolean | null => {
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let current = true;
    void videoEditSupported().then((value) => {
      if (current) setSupported(value);
    });
    return () => {
      current = false;
    };
  }, [enabled]);

  return supported;
};
