import { parseRecordingMemoryArguments } from './recording-memory-arguments.mjs';

try {
  const {
    durationSeconds,
    mainMiBPerMinute,
    sidecarMiBPerMinute,
    sampleRate,
    channels,
    processedOutputMultiplier,
  } = parseRecordingMemoryArguments(process.argv.slice(2));
  const bytesPerMiB = 1024 * 1024;
  const mainBytes = (mainMiBPerMinute * durationSeconds * bytesPerMiB) / 60;
  const sidecarBytes = (sidecarMiBPerMinute * durationSeconds * bytesPerMiB) / 60;
  const decodedAudioBytes = durationSeconds * sampleRate * channels * 4;
  const processedOutputBytes = mainBytes * processedOutputMultiplier;
  const captureBytes = mainBytes + sidecarBytes;
  const finalizationPeakBytes = captureBytes + decodedAudioBytes + processedOutputBytes;
  const format = (bytes) => `${(bytes / bytesPerMiB).toFixed(1)} MiB`;

  console.log(`Capture retention: ${format(captureBytes)}`);
  console.log(`Decoded audio upper bound: ${format(decodedAudioBytes)}`);
  console.log(`Processed-output allowance: ${format(processedOutputBytes)}`);
  console.log(`Conservative finalization peak: ${format(finalizationPeakBytes)}`);
  console.log(
    'This is a planning estimate, not a browser heap measurement. Compare it with a physical-device performance-memory profile before changing recording behavior.',
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Invalid recording-memory arguments.');
  process.exitCode = 1;
}
