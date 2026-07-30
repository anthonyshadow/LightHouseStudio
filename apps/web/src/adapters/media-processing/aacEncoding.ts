let aacEncoderRegistration: Promise<void> | null = null;

export const ensureAacEncodingSupport = async (
  canEncode: () => Promise<boolean>,
): Promise<void> => {
  if (await canEncode()) return;

  aacEncoderRegistration ??= import('@mediabunny/aac-encoder')
    .then(({ registerAacEncoder }) => {
      registerAacEncoder();
    })
    .catch((error: unknown) => {
      aacEncoderRegistration = null;
      throw error;
    });
  await aacEncoderRegistration;

  if (!(await canEncode())) {
    throw new Error('This browser cannot encode AAC audio.');
  }
};
