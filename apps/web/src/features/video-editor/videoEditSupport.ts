/**
 * Whether this browser can run the editor's WebGL preview, probed with a throwaway context that is
 * released at once.
 *
 * On its own so the surfaces that only ask the question — the Studio route deciding whether to
 * offer the editor, a save dialog deciding whether to offer a placement — do not load the shader
 * source and renderer that only the open editor runs.
 */
export const videoEditPreviewSupported = (): boolean => {
  if (typeof document === 'undefined') return false;
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl');
  if (!gl) return false;
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return true;
};
