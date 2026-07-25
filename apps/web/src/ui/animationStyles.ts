import { keyframes, type CSSObject, type Theme } from '@emotion/react';

type OverlayMotionPlacement = 'right' | 'bottom' | 'fullscreen';

const overlayBackdropFadeIn = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const overlayBackdropFadeOut = keyframes({
  from: { opacity: 1 },
  to: { opacity: 0 },
});

const overlayPanelSlideInRight = keyframes({
  from: { opacity: 0, transform: 'translateX(1rem)' },
  to: { opacity: 1, transform: 'translateX(0)' },
});

const overlayPanelSlideOutRight = keyframes({
  from: { opacity: 1, transform: 'translateX(0)' },
  to: { opacity: 0, transform: 'translateX(1rem)' },
});

const overlayPanelSlideInBottom = keyframes({
  from: { opacity: 0, transform: 'translateY(1rem)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});

const overlayPanelSlideOutBottom = keyframes({
  from: { opacity: 1, transform: 'translateY(0)' },
  to: { opacity: 0, transform: 'translateY(1rem)' },
});

const continuousRotation = keyframes({
  to: { transform: 'rotate(360deg)' },
});

export const overlayBackdropAnimationStyles = (theme: Theme, exiting: boolean): CSSObject => ({
  animation: `${exiting ? overlayBackdropFadeOut : overlayBackdropFadeIn} ${theme.motion.standard} both`,
  '@media (prefers-reduced-motion: reduce)': {
    animation: 'none',
  },
});

export const overlayPanelAnimationStyles = (
  theme: Theme,
  placement: OverlayMotionPlacement,
  exiting: boolean,
): CSSObject => {
  let animation;
  switch (placement) {
    case 'right':
      animation = exiting ? overlayPanelSlideOutRight : overlayPanelSlideInRight;
      break;
    case 'bottom':
      animation = exiting ? overlayPanelSlideOutBottom : overlayPanelSlideInBottom;
      break;
    case 'fullscreen':
      animation = exiting ? overlayBackdropFadeOut : overlayBackdropFadeIn;
      break;
  }

  return {
    animation: `${animation} ${theme.motion.standard} both`,
    willChange: 'transform, opacity',
    '@media (prefers-reduced-motion: reduce)': {
      animation: 'none',
    },
  };
};

export const rotatingSpinnerAnimationStyles = (
  duration: string,
  reducedMotionStyles: CSSObject = {},
): CSSObject => ({
  animation: `${continuousRotation} ${duration} linear infinite`,
  '@media (prefers-reduced-motion: reduce)': {
    animation: 'none',
    ...reducedMotionStyles,
  },
});

export const fadingVisibilityAnimationStyles = (
  theme: Theme,
  visible: boolean,
  visibleTransform: string,
  hiddenTransform: string,
): CSSObject => ({
  opacity: visible ? 1 : 0,
  transform: visible ? visibleTransform : hiddenTransform,
  pointerEvents: visible ? 'auto' : 'none',
  transition: `opacity ${theme.motion.standard}, transform ${theme.motion.standard}`,
  willChange: 'transform, opacity',
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
  },
});
