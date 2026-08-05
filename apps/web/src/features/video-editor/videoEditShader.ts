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
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}`;

const FILTER_IDS: Record<VideoEditSpec['filter'], number> = {
  original: 0,
  vivid: 1,
  warm: 2,
  cool: 3,
  mono: 4,
  fade: 5,
};

type RenderCanvas = HTMLCanvasElement | OffscreenCanvas;

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
  dispose: () => void;
}>;

export const createVideoEditFrameRenderer = (canvas: RenderCanvas): VideoEditFrameRenderer => {
  const gl = canvas.getContext('webgl', {
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
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  } catch (error) {
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

  return {
    render: (source, spec) => {
      gl.viewport(0, 0, canvas.width, canvas.height);
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
      gl.deleteTexture(texture);
      gl.deleteBuffer(position);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    },
  };
};

export const videoEditPreviewSupported = (): boolean => {
  if (typeof document === 'undefined') return false;
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl');
  if (!gl) return false;
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return true;
};
