import type { AudioCodec } from 'mediabunny';
import { decodeAudioBlob } from './audioEffects';

const isMp4 = (blob: Blob): boolean => blob.type.includes('mp4');

export type ReplacedAudio = { blob: Blob; mimeType: string };

export const replaceRecordingAudio = async (
  originalVideo: Blob,
  replacementAudio: Blob | AudioBuffer,
  signal: AbortSignal,
): Promise<ReplacedAudio> => {
  signal.throwIfAborted();
  const {
    ALL_FORMATS,
    AudioBufferSource,
    BlobSource,
    BufferTarget,
    EncodedPacketSink,
    EncodedVideoPacketSource,
    Input,
    Mp4OutputFormat,
    Output,
    WebMOutputFormat,
    canEncodeAudio,
  } = await import('mediabunny');
  signal.throwIfAborted();
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(originalVideo) });
  const target = new BufferTarget();
  const mp4 = isMp4(originalVideo);
  const output = new Output({
    format: mp4 ? new Mp4OutputFormat() : new WebMOutputFormat(),
    target,
  });

  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error('The original recording has no video track.');
    const videoCodec = await videoTrack.getCodec();
    if (!videoCodec) throw new Error('The original video codec could not be identified.');

    const audioBuffer =
      replacementAudio instanceof AudioBuffer
        ? replacementAudio
        : await decodeAudioBlob(replacementAudio);
    signal.throwIfAborted();

    const audioCodec: AudioCodec = mp4 ? 'aac' : 'opus';
    if (
      !(await canEncodeAudio(audioCodec, {
        numberOfChannels: audioBuffer.numberOfChannels,
        sampleRate: audioBuffer.sampleRate,
        bitrate: 128_000,
      }))
    ) {
      throw new Error(`This browser cannot encode ${audioCodec.toUpperCase()} audio.`);
    }

    const videoSource = new EncodedVideoPacketSource(videoCodec);
    const audioSource = new AudioBufferSource({ codec: audioCodec, bitrate: 128_000 });
    output.addVideoTrack(videoSource);
    output.addAudioTrack(audioSource);
    await output.start();

    const pumpVideo = async () => {
      const sink = new EncodedPacketSink(videoTrack);
      const decoderConfig = await videoTrack.getDecoderConfig();
      let first = true;
      for await (const packet of sink.packets()) {
        signal.throwIfAborted();
        await videoSource.add(packet, first && decoderConfig ? { decoderConfig } : undefined);
        first = false;
      }
      videoSource.close();
    };

    await Promise.all([
      pumpVideo(),
      (async () => {
        await audioSource.add(audioBuffer);
        audioSource.close();
      })(),
    ]);
    signal.throwIfAborted();
    const mimeType = await output.getMimeType();
    await output.finalize();
    if (!target.buffer) throw new Error('The processed recording was empty.');
    return { blob: new Blob([target.buffer], { type: mimeType }), mimeType };
  } catch (error) {
    if (output.state === 'started') await output.cancel().catch(() => undefined);
    throw error;
  } finally {
    input.dispose();
  }
};
