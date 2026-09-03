// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultVideoEditSpec } from '@studio/domain';
import { createVideoEditFrameRenderer } from './videoEditShader';

afterEach(() => vi.restoreAllMocks());

/** A WebGL context that records every call and hands out two distinguishable textures. */
const recordingContext = () => {
  const frameTexture = { name: 'frame' } as unknown as WebGLTexture;
  const overlayTexture = { name: 'overlay' } as unknown as WebGLTexture;
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    ARRAY_BUFFER: 5,
    STATIC_DRAW: 6,
    FLOAT: 7,
    TEXTURE_2D: 8,
    TEXTURE_WRAP_S: 9,
    TEXTURE_WRAP_T: 10,
    CLAMP_TO_EDGE: 11,
    TEXTURE_MIN_FILTER: 12,
    TEXTURE_MAG_FILTER: 13,
    LINEAR: 14,
    RGBA: 15,
    UNSIGNED_BYTE: 16,
    UNPACK_FLIP_Y_WEBGL: 17,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 18,
    TEXTURE0: 19,
    TEXTURE1: 20,
    TRIANGLES: 21,
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    useProgram: vi.fn(),
    createBuffer: vi.fn(() => ({})),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    createTexture: vi.fn().mockReturnValueOnce(frameTexture).mockReturnValueOnce(overlayTexture),
    bindTexture: vi.fn(),
    texParameteri: vi.fn(),
    activeTexture: vi.fn(),
    texImage2D: vi.fn(),
    pixelStorei: vi.fn(),
    getUniformLocation: vi.fn((_program: unknown, name: string) => ({ name })),
    uniform1i: vi.fn(),
    uniform1f: vi.fn<(location: { name: string } | null, value: number) => void>(),
    uniform2f: vi.fn(),
    uniform4f: vi.fn(),
    viewport: vi.fn(),
    drawArrays: vi.fn(),
    deleteTexture: vi.fn(),
    deleteBuffer: vi.fn(),
    deleteProgram: vi.fn(),
    deleteShader: vi.fn(),
  };
  const canvas = {
    width: 640,
    height: 360,
    getContext: vi.fn().mockReturnValue(gl),
  } as unknown as HTMLCanvasElement;
  return { gl, canvas, frameTexture, overlayTexture };
};

const uniformValues = (gl: ReturnType<typeof recordingContext>['gl'], name: string): number[] =>
  gl.uniform1f.mock.calls.filter(([location]) => location?.name === name).map(([, value]) => value);

describe('videoEditShader subtitle overlay', () => {
  it('starts disabled on its own unit, uploads premultiplied once per change, and is released', () => {
    const { gl, canvas, frameTexture, overlayTexture } = recordingContext();
    const renderer = createVideoEditFrameRenderer(canvas);

    // Initialization: the frame sampler on unit 0, the overlay sampler on unit 1 holding one
    // transparent pixel, and the overlay switched off.
    expect(gl.uniform1i).toHaveBeenCalledWith({ name: 'u_texture' }, 0);
    expect(gl.uniform1i).toHaveBeenCalledWith({ name: 'u_overlay' }, 1);
    expect(gl.texImage2D).toHaveBeenCalledWith(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      expect.any(Uint8Array),
    );
    expect(uniformValues(gl, 'u_overlayEnabled')).toEqual([0]);
    const uploadsAfterInit = gl.texImage2D.mock.calls.length;

    const overlay = { tag: 'overlay-canvas' } as unknown as TexImageSource;
    renderer.setOverlay(overlay);
    expect(gl.activeTexture).toHaveBeenCalledWith(gl.TEXTURE1);
    expect(gl.bindTexture).toHaveBeenCalledWith(gl.TEXTURE_2D, overlayTexture);
    expect(gl.pixelStorei).toHaveBeenCalledWith(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
    expect(gl.texImage2D).toHaveBeenLastCalledWith(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      overlay,
    );
    expect(gl.pixelStorei).toHaveBeenLastCalledWith(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    expect(gl.activeTexture).toHaveBeenLastCalledWith(gl.TEXTURE0);
    expect(uniformValues(gl, 'u_overlayEnabled')).toEqual([0, 1]);
    expect(gl.texImage2D.mock.calls.length).toBe(uploadsAfterInit + 1);

    // Clearing costs no upload, only the switch.
    renderer.setOverlay(null);
    expect(uniformValues(gl, 'u_overlayEnabled')).toEqual([0, 1, 0]);
    expect(gl.texImage2D.mock.calls.length).toBe(uploadsAfterInit + 1);

    // A frame always lands on unit 0, whatever the overlay did last.
    const source = { tag: 'frame' } as unknown as TexImageSource;
    renderer.render(source, createDefaultVideoEditSpec(1_000));
    expect(gl.bindTexture).toHaveBeenLastCalledWith(gl.TEXTURE_2D, frameTexture);
    expect(gl.texImage2D).toHaveBeenLastCalledWith(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      source,
    );
    expect(gl.drawArrays).toHaveBeenCalledWith(gl.TRIANGLES, 0, 6);

    renderer.dispose();
    expect(gl.deleteTexture).toHaveBeenCalledWith(overlayTexture);
    expect(gl.deleteTexture).toHaveBeenCalledWith(frameTexture);
  });
});

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
});
