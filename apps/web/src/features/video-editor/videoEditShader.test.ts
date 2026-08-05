// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createVideoEditFrameRenderer, videoEditPreviewSupported } from './videoEditShader';

afterEach(() => vi.restoreAllMocks());

describe('videoEditShader resource ownership', () => {
  it('unwinds shaders allocated before initialization fails', () => {
    const vertex = {} as WebGLShader;
    const fragment = {} as WebGLShader;
    const gl = {
      VERTEX_SHADER: 1,
      FRAGMENT_SHADER: 2,
      COMPILE_STATUS: 3,
      createShader: vi.fn().mockReturnValueOnce(vertex).mockReturnValueOnce(fragment),
      shaderSource: vi.fn(),
      compileShader: vi.fn(),
      getShaderParameter: vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false),
      deleteShader: vi.fn(),
    } as unknown as WebGLRenderingContext;
    const canvas = {
      width: 100,
      height: 100,
      getContext: vi.fn().mockReturnValue(gl),
    } as unknown as HTMLCanvasElement;

    expect(() => createVideoEditFrameRenderer(canvas)).toThrow(/shader is unavailable/iu);
    expect(gl.deleteShader).toHaveBeenCalledWith(fragment);
    expect(gl.deleteShader).toHaveBeenCalledWith(vertex);
  });

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
});
