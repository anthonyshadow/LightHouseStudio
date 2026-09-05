/**
 * Whether this browser can decode a particular video, asked with the file's own decoder
 * configuration rather than a guess at its codec string.
 *
 * Phone footage is the reason this exists: an iPhone records HEVC by default, which this product
 * cannot publish, and until a browser is asked there is no honest way to say whether it could be
 * converted here or whether the person has to convert it elsewhere. `isConfigSupported` is the
 * only answer that is about this browser on this device rather than about a name.
 *
 * Memoized per codec, because the answer is a property of the browser and asking is not free.
 * A browser without WebCodecs answers no rather than throwing, which is the same shape of answer.
 */
const answers = new Map<string, Promise<boolean>>();

export const videoDecoderSupportsConfig = (config: VideoDecoderConfig): Promise<boolean> => {
  if (
    typeof VideoDecoder === 'undefined' ||
    typeof VideoDecoder.isConfigSupported !== 'function' ||
    typeof config.codec !== 'string' ||
    config.codec.length === 0
  ) {
    return Promise.resolve(false);
  }
  const cached = answers.get(config.codec);
  if (cached !== undefined) return cached;
  const answer = VideoDecoder.isConfigSupported(config)
    .then((support) => support.supported === true)
    .catch(() => false);
  answers.set(config.codec, answer);
  return answer;
};

/** Test seam: the memo is a property of the page, and a test that changes the answer must clear it. */
export const resetVideoDecodeSupportForTests = (): void => {
  answers.clear();
};
