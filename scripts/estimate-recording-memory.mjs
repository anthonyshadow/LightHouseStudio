const usage = `Usage: pnpm recording:memory:estimate \\
  --duration-seconds <seconds> \\
  --main-mib-per-minute <MiB> [--sidecar-mib-per-minute <MiB>] \\
  [--sample-rate <Hz>] [--channels <count>] [--processed-output-multiplier <factor>]`;

const numericArguments = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const option = process.argv[index];
  const value = process.argv[index + 1];
  if (!option?.startsWith('--') || value === undefined) {
    console.error(usage);
    process.exitCode = 1;
    break;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    console.error(`Expected a non-negative number for ${option}.`);
    process.exitCode = 1;
    break;
  }
  numericArguments.set(option, parsed);
}

if (!process.exitCode) {
  const read = (option, fallback) => numericArguments.get(option) ?? fallback;
  const durationSeconds = read('--duration-seconds', 0);
  const mainMiBPerMinute = read('--main-mib-per-minute', 0);
  if (durationSeconds <= 0 || mainMiBPerMinute <= 0) {
    console.error(usage);
    process.exitCode = 1;
  } else {
    const sidecarMiBPerMinute = read('--sidecar-mib-per-minute', 0);
    const sampleRate = read('--sample-rate', 48_000);
    const channels = read('--channels', 2);
    const processedOutputMultiplier = read('--processed-output-multiplier', 1.1);
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
  }
}
