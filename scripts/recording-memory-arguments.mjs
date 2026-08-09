export const recordingMemoryUsage = `Usage: bun run recording:memory:estimate \\
  --duration-seconds <seconds> \\
  --main-mib-per-minute <MiB> [--sidecar-mib-per-minute <MiB>] \\
  [--sample-rate <Hz>] [--channels <count>] [--processed-output-multiplier <factor>]`;

const definitions = new Map([
  ['--duration-seconds', { minimum: 1, maximum: 300, integer: true, required: true }],
  ['--main-mib-per-minute', { minimum: 0.01, maximum: 1_024, required: true }],
  ['--sidecar-mib-per-minute', { minimum: 0, maximum: 1_024, fallback: 0 }],
  ['--sample-rate', { minimum: 8_000, maximum: 384_000, integer: true, fallback: 48_000 }],
  ['--channels', { minimum: 1, maximum: 32, integer: true, fallback: 2 }],
  ['--processed-output-multiplier', { minimum: 0.01, maximum: 10, fallback: 1.1 }],
]);

const invalid = (message) => new TypeError(`${message}\n${recordingMemoryUsage}`);

export const parseRecordingMemoryArguments = (arguments_) => {
  if (arguments_.length % 2 !== 0) throw invalid('Every option requires a value.');
  const parsed = new Map();

  for (let index = 0; index < arguments_.length; index += 2) {
    const option = arguments_[index];
    const rawValue = arguments_[index + 1];
    const definition = definitions.get(option);
    if (definition === undefined) throw invalid(`Unknown option: ${option ?? '<missing>'}.`);
    if (parsed.has(option)) throw invalid(`Duplicate option: ${option}.`);
    if (rawValue === undefined || rawValue.trim() === '') {
      throw invalid(`Expected a numeric value for ${option}.`);
    }
    const value = Number(rawValue);
    if (!Number.isFinite(value)) throw invalid(`Expected a finite number for ${option}.`);
    if (definition.integer === true && !Number.isSafeInteger(value)) {
      throw invalid(`Expected an integer for ${option}.`);
    }
    if (value < definition.minimum || value > definition.maximum) {
      throw invalid(`Expected ${option} from ${definition.minimum} through ${definition.maximum}.`);
    }
    parsed.set(option, value);
  }

  for (const [option, definition] of definitions) {
    if (definition.required === true && !parsed.has(option)) {
      throw invalid(`Missing required option: ${option}.`);
    }
  }

  return {
    durationSeconds: parsed.get('--duration-seconds'),
    mainMiBPerMinute: parsed.get('--main-mib-per-minute'),
    sidecarMiBPerMinute:
      parsed.get('--sidecar-mib-per-minute') ??
      definitions.get('--sidecar-mib-per-minute').fallback,
    sampleRate: parsed.get('--sample-rate') ?? definitions.get('--sample-rate').fallback,
    channels: parsed.get('--channels') ?? definitions.get('--channels').fallback,
    processedOutputMultiplier:
      parsed.get('--processed-output-multiplier') ??
      definitions.get('--processed-output-multiplier').fallback,
  };
};
