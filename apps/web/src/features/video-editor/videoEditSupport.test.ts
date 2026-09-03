// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { videoEditPreviewSupported } from './videoEditSupport';

afterEach(() => vi.restoreAllMocks());

describe('videoEditPreviewSupported', () => {
  it('releases the temporary WebGL capability-probe context', () => {
    const loseContext = vi.fn();
    const gl = {
      getExtension: vi.fn().mockReturnValue({ loseContext }),
    } as unknown as WebGLRenderingContext;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(gl);

    expect(videoEditPreviewSupported()).toBe(true);
    expect(gl.getExtension).toHaveBeenCalledWith('WEBGL_lose_context');
    expect(loseContext).toHaveBeenCalledOnce();
  });

  it('answers no where the browser gives no WebGL context', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(videoEditPreviewSupported()).toBe(false);
  });
});
