import type { VideoEditSpec } from '@studio/domain';

const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = vec2((a_position.x + 1.0) * 0.5, 1.0 - (a_position.y + 1.0) * 0.5);
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D u_texture;
uniform sampler2D u_overlay;
uniform float u_overlayEnabled;
uniform vec4 u_crop;
uniform float u_rotation;
uniform vec2 u_flip;
uniform vec4 u_adjustA;
uniform vec2 u_adjustB;
uniform float u_filter;
varying vec2 v_uv;

vec2 sourceUv(vec2 uv) {
  vec2 edited = mix(uv, vec2(1.0) - uv, u_flip);
  vec2 cropped = u_crop.xy + edited * u_crop.zw;
  if (u_rotation < 0.5) return cropped;
  if (u_rotation < 1.5) return vec2(cropped.y, 1.0 - cropped.x);
  if (u_rotation < 2.5) return vec2(1.0 - cropped.x, 1.0 - cropped.y);
  return vec2(1.0 - cropped.y, cropped.x);
}

void main() {
  vec3 color = texture2D(u_texture, sourceUv(v_uv)).rgb;
  float filterId = u_filter;
  if (filterId > 0.5 && filterId < 1.5) {
    color = (color - 0.5) * 1.12 + 0.5;
    color = mix(vec3(dot(color, vec3(0.2126, 0.7152, 0.0722))), color, 1.18);
  } else if (filterId > 1.5 && filterId < 2.5) {
    color += vec3(0.08, 0.025, -0.055);
  } else if (filterId > 2.5 && filterId < 3.5) {
    color += vec3(-0.05, 0.015, 0.08);
  } else if (filterId > 3.5 && filterId < 4.5) {
    float mono = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = vec3(mono);
  } else if (filterId > 4.5) {
    float mono = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = mix(vec3(mono), color, 0.72);
    color = mix(color, vec3(0.5), 0.12);
  }

  float brightness = u_adjustA.x;
  float contrast = u_adjustA.y;
  float saturation = u_adjustA.z;
  float temperature = u_adjustA.w;
  float highlights = u_adjustB.x;
  float shadows = u_adjustB.y;
  color += brightness * 0.45;
  color = (color - 0.5) * (1.0 + contrast * 0.9) + 0.5;
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(luma), color, 1.0 + saturation);
  color += vec3(temperature * 0.12, temperature * 0.025, -temperature * 0.12);
  color += highlights * smoothstep(0.45, 1.0, luma) * 0.3;
  color += shadows * (1.0 - smoothstep(0.0, 0.55, luma)) * 0.3;
  // Subtitles composite in output space, over the graded frame: sampled at v_uv rather than the
  // cropped, rotated, flipped source position, so text is never re-framed or colour-graded. The
  // overlay is premultiplied, which makes the blend one multiply-add.
  vec4 overlay = texture2D(u_overlay, v_uv) * u_overlayEnabled;
  gl_FragColor = vec4(overlay.rgb + clamp(color, 0.0, 1.0) * (1.0 - overlay.a), 1.0);
}`;

const FILTER_IDS: Record<VideoEditSpec['filter'], number> = {
  original: 0,
  vivid: 1,
  warm: 2,
  cool: 3,
  mono: 4,
  fade: 5,
};

/** Either canvas the editor draws on: the page's preview, or the worker's output frame. */
export type RenderCanvas = HTMLCanvasElement | OffscreenCanvas;

/**
 * The WebGL context for either canvas kind.
 *
 * `getContext` cannot be called on the union directly: each canvas type declares its own overload
 * set, and calling through the union collapses them to the widest return, `RenderingContext` —
 * which includes the 2D context and so answers none of the WebGL calls below. Narrowing first lets
 * each type resolve its own `'webgl'` overload. The test is a property rather than
 * `instanceof HTMLCanvasElement` because the render worker has no DOM constructors to test against.
 */
const webglContext = (
  canvas: RenderCanvas,
  attributes: WebGLContextAttributes,
): WebGLRenderingContext | null =>
  'transferControlToOffscreen' in canvas
    ? canvas.getContext('webgl', attributes)
    : canvas.getContext('webgl', attributes);

const compileShader = (gl: WebGLRenderingContext, type: number, source: string): WebGLShader => {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('The video editor could not allocate a GPU shader.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    throw new Error('The video editor shader is unavailable in this browser.');
  }
  return shader;
};

export type VideoEditFrameRenderer = Readonly<{
  render: (source: TexImageSource, spec: VideoEditSpec) => void;
  /**
   * Text composited over the graded frame in output space; `null` draws none. An upload is a
   * full-frame copy to the GPU, so callers set it when the active cues change, never per frame.
   */
  setOverlay: (overlay: TexImageSource | null) => void;
  dispose: () => void;
}>;

const TRANSPARENT_PIXEL = new Uint8Array([0, 0, 0, 0]);

const configureTexture = (gl: WebGLRenderingContext): void => {
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
};

export const createVideoEditFrameRenderer = (canvas: RenderCanvas): VideoEditFrameRenderer => {
  const gl = webglContext(canvas, {
    alpha: false,
    antialias: false,
    preserveDrawingBuffer: false,
  });
  if (!gl) throw new Error('WebGL is required for local video editing.');
  let vertex: WebGLShader | null = null;
  let fragment: WebGLShader | null = null;
  let program: WebGLProgram | null = null;
  let position: WebGLBuffer | null = null;
  let texture: WebGLTexture | null = null;
  let overlayTexture: WebGLTexture | null = null;
  try {
    vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    program = gl.createProgram();
    if (!program) throw new Error('The video editor could not allocate a GPU program.');
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error('The video editor GPU program could not be linked.');
    }
    gl.useProgram(program);
    position = gl.createBuffer();
    if (!position) throw new Error('The video editor could not allocate a GPU buffer.');
    gl.bindBuffer(gl.ARRAY_BUFFER, position);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const positionLocation = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    texture = gl.createTexture();
    if (!texture) throw new Error('The video editor could not allocate a GPU texture.');
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    configureTexture(gl);
    // The overlay lives on unit 1 and starts as one transparent pixel, so sampling it before any
    // subtitle is set composites nothing rather than an incomplete texture.
    overlayTexture = gl.createTexture();
    if (!overlayTexture) throw new Error('The video editor could not allocate a GPU texture.');
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, overlayTexture);
    configureTexture(gl);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, TRANSPARENT_PIXEL);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);
    gl.uniform1i(gl.getUniformLocation(program, 'u_overlay'), 1);
  } catch (error) {
    if (overlayTexture) gl.deleteTexture(overlayTexture);
    if (texture) gl.deleteTexture(texture);
    if (position) gl.deleteBuffer(position);
    if (program) gl.deleteProgram(program);
    if (fragment) gl.deleteShader(fragment);
    if (vertex) gl.deleteShader(vertex);
    throw error;
  }

  const cropLocation = gl.getUniformLocation(program, 'u_crop');
  const rotationLocation = gl.getUniformLocation(program, 'u_rotation');
  const flipLocation = gl.getUniformLocation(program, 'u_flip');
  const adjustALocation = gl.getUniformLocation(program, 'u_adjustA');
  const adjustBLocation = gl.getUniformLocation(program, 'u_adjustB');
  const filterLocation = gl.getUniformLocation(program, 'u_filter');
  const overlayEnabledLocation = gl.getUniformLocation(program, 'u_overlayEnabled');
  gl.uniform1f(overlayEnabledLocation, 0);

  return {
    setOverlay: (overlay) => {
      if (overlay === null) {
        gl.uniform1f(overlayEnabledLocation, 0);
        return;
      }
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, overlayTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, overlay);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1f(overlayEnabledLocation, 1);
    },
    render: (source, spec) => {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      const crop = spec.crop.rectangle;
      gl.uniform4f(cropLocation, crop.x, crop.y, crop.width, crop.height);
      gl.uniform1f(rotationLocation, spec.rotation / 90);
      gl.uniform2f(flipLocation, spec.flipHorizontal ? 1 : 0, spec.flipVertical ? 1 : 0);
      const adjustments = spec.adjustments;
      gl.uniform4f(
        adjustALocation,
        adjustments.brightness / 100,
        adjustments.contrast / 100,
        adjustments.saturation / 100,
        adjustments.temperature / 100,
      );
      gl.uniform2f(adjustBLocation, adjustments.highlights / 100, adjustments.shadows / 100);
      gl.uniform1f(filterLocation, FILTER_IDS[spec.filter]);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
    dispose: () => {
      gl.deleteTexture(overlayTexture);
      gl.deleteTexture(texture);
      gl.deleteBuffer(position);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    },
  };
};
