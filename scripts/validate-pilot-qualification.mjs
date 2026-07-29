import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_ROOT, '..');
const DEFAULT_MANIFEST_PATH = path.join(
  REPOSITORY_ROOT,
  'docs',
  'qualification',
  'required-matrix.json',
);
const DEFAULT_RECORDS_PATH = path.join(REPOSITORY_ROOT, 'docs', 'qualification', 'evidence');

const REQUIRED_ROLES = [
  'Credential Custodian',
  'Billing Authorizer',
  'Evidence Recorder',
  'Support & Escalation Owner',
];
const RECORD_KEYS = [
  'schemaVersion',
  'evidenceId',
  'requirementId',
  'recordedAt',
  'commitSha',
  'accountEnvironmentClass',
  'accessMode',
  'configurationId',
  'environment',
  'roles',
  'checks',
  'overallResult',
];
const ENVIRONMENT_KEYS = ['deviceClass', 'osName', 'osVersion', 'browserName', 'browserVersion'];
const CHECK_KEYS = ['id', 'result', 'safeCode', 'durationMs', 'clipDurationSeconds', 'mimeType'];
const ALLOWED_RESULTS = new Set(['pass', 'fail', 'blocked']);
const ALLOWED_ACCESS_MODES = new Set(['participant', 'operator-qualification']);
const ALLOWED_ACCOUNT_CLASSES = new Set([
  'no-provider-credentials',
  'dedicated-least-privilege-development',
]);
const SAFE_IDENTIFIER = /^[a-z0-9][a-z0-9._:+-]{0,199}$/u;
const SAFE_TEXT = /^[\p{L}\p{N} ._()+,:;/&-]{1,200}$/u;
const COMMIT_SHA = /^[0-9a-f]{40}$/u;
const MIME_TYPE = /^(?:audio|video|image)\/[a-z0-9][a-z0-9.+-]{0,63}$/u;

const exactKeys = (value, expected, location, errors) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`${location} must be an object`);
    return false;
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    errors.push(`${location} must contain exactly: ${wanted.join(', ')}`);
    return false;
  }
  return true;
};

const safeString = (value, location, errors, pattern = SAFE_TEXT) => {
  if (typeof value !== 'string' || !pattern.test(value)) {
    errors.push(`${location} is missing or contains disallowed content`);
    return false;
  }
  return true;
};

const nullableBoundedNumber = (value, location, maximum, errors) => {
  if (value !== null && (!Number.isInteger(value) || value < 0 || value > maximum)) {
    errors.push(`${location} must be null or an integer from 0 to ${maximum}`);
  }
};

export const expandQualificationRequirements = (manifest) => {
  const provider = manifest.providerRequirements.map((requirement) => ({
    key: `provider:${requirement.id}`,
    kind: 'provider',
    configurationId: requirement.configurationId,
    accessMode: requirement.accessMode,
    checks: requirement.checks,
    accountEnvironmentClass:
      requirement.id === 'local-no-key'
        ? 'no-provider-credentials'
        : 'dedicated-least-privilege-development',
    deviceClass: null,
    browserTarget: null,
  }));
  const physical = manifest.physicalTargets.flatMap((target) => {
    const checks = [
      ...new Set(
        target.checkSets.flatMap((checkSet) => manifest.physicalCheckSets[checkSet] ?? []),
      ),
    ];
    return target.browsers.map((browserTarget) => ({
      key: `physical:${target.id}:${browserTarget.toLowerCase().replaceAll(' ', '-')}`,
      kind: 'physical',
      configurationId: `physical:${target.id}:${browserTarget}`,
      accessMode: 'participant',
      checks,
      accountEnvironmentClass: 'dedicated-least-privilege-development',
      deviceClass: target.deviceClass,
      browserTarget,
    }));
  });
  return [...provider, ...physical];
};

export const validateEvidenceRecord = (record, requirement) => {
  const errors = [];
  if (!exactKeys(record, RECORD_KEYS, 'record', errors)) return errors;

  if (record.schemaVersion !== 1) errors.push('record.schemaVersion must equal 1');
  safeString(record.evidenceId, 'record.evidenceId', errors, SAFE_IDENTIFIER);
  if (record.requirementId !== requirement.key) {
    errors.push(`record.requirementId must equal ${requirement.key}`);
  }
  if (
    typeof record.recordedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(record.recordedAt) ||
    Number.isNaN(Date.parse(record.recordedAt))
  ) {
    errors.push('record.recordedAt must be a UTC ISO-8601 timestamp');
  }
  safeString(record.commitSha, 'record.commitSha', errors, COMMIT_SHA);
  if (!ALLOWED_ACCOUNT_CLASSES.has(record.accountEnvironmentClass)) {
    errors.push('record.accountEnvironmentClass is not allowlisted');
  } else if (record.accountEnvironmentClass !== requirement.accountEnvironmentClass) {
    errors.push(`record.accountEnvironmentClass must equal ${requirement.accountEnvironmentClass}`);
  }
  if (!ALLOWED_ACCESS_MODES.has(record.accessMode)) {
    errors.push('record.accessMode is not allowlisted');
  } else if (record.accessMode !== requirement.accessMode) {
    errors.push(`record.accessMode must equal ${requirement.accessMode}`);
  }
  if (record.configurationId !== requirement.configurationId) {
    errors.push(`record.configurationId must equal ${requirement.configurationId}`);
  }

  if (exactKeys(record.environment, ENVIRONMENT_KEYS, 'record.environment', errors)) {
    for (const key of ENVIRONMENT_KEYS) {
      safeString(record.environment[key], `record.environment.${key}`, errors);
    }
    if (
      requirement.deviceClass !== null &&
      record.environment.deviceClass !== requirement.deviceClass
    ) {
      errors.push(`record.environment.deviceClass must equal ${requirement.deviceClass}`);
    }
  }

  if (
    !Array.isArray(record.roles) ||
    JSON.stringify([...record.roles].sort()) !== JSON.stringify([...REQUIRED_ROLES].sort())
  ) {
    errors.push(`record.roles must contain exactly: ${REQUIRED_ROLES.join(', ')}`);
  }

  if (!Array.isArray(record.checks)) {
    errors.push('record.checks must be an array');
  } else {
    const actualCheckIds = [];
    record.checks.forEach((check, index) => {
      const location = `record.checks[${index}]`;
      if (!exactKeys(check, CHECK_KEYS, location, errors)) return;
      if (safeString(check.id, `${location}.id`, errors, SAFE_IDENTIFIER)) {
        actualCheckIds.push(check.id);
      }
      if (!ALLOWED_RESULTS.has(check.result)) {
        errors.push(`${location}.result is not allowlisted`);
      }
      if (check.safeCode !== null) {
        safeString(check.safeCode, `${location}.safeCode`, errors, SAFE_IDENTIFIER);
      }
      nullableBoundedNumber(check.durationMs, `${location}.durationMs`, 3_600_000, errors);
      nullableBoundedNumber(
        check.clipDurationSeconds,
        `${location}.clipDurationSeconds`,
        300,
        errors,
      );
      if (check.mimeType !== null) {
        safeString(check.mimeType, `${location}.mimeType`, errors, MIME_TYPE);
      }
    });
    const actual = [...actualCheckIds].sort();
    const expected = [...requirement.checks].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      errors.push(`record.checks must contain exactly: ${expected.join(', ')}`);
    }
  }

  if (!ALLOWED_RESULTS.has(record.overallResult)) {
    errors.push('record.overallResult is not allowlisted');
  }
  if (
    record.overallResult === 'pass' &&
    Array.isArray(record.checks) &&
    record.checks.some((check) => check.result !== 'pass')
  ) {
    errors.push('a passing record cannot contain a failed or blocked check');
  }

  return errors;
};

const readJson = async (candidate) => JSON.parse(await readFile(candidate, 'utf8'));

export const inspectQualificationEvidence = async ({
  manifestPath = DEFAULT_MANIFEST_PATH,
  recordsPath = DEFAULT_RECORDS_PATH,
  commitSha,
}) => {
  const manifest = await readJson(manifestPath);
  const requirements = expandQualificationRequirements(manifest);
  const requirementByKey = new Map(
    requirements.map((requirement) => [requirement.key, requirement]),
  );
  let entries = [];
  try {
    entries = await readdir(recordsPath, { withFileTypes: true });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(recordsPath, entry.name))
    .sort();
  const errors = [];
  const records = [];
  const evidenceIds = new Set();

  for (const file of files) {
    let record;
    try {
      record = await readJson(file);
    } catch (error) {
      errors.push(`${path.basename(file)}: invalid JSON (${error.message})`);
      continue;
    }
    const requirement = requirementByKey.get(record?.requirementId);
    if (!requirement) {
      errors.push(`${path.basename(file)}: unknown requirementId`);
      continue;
    }
    const recordErrors = validateEvidenceRecord(record, requirement);
    for (const error of recordErrors) errors.push(`${path.basename(file)}: ${error}`);
    if (evidenceIds.has(record.evidenceId)) {
      errors.push(`${path.basename(file)}: duplicate evidenceId ${record.evidenceId}`);
    }
    evidenceIds.add(record.evidenceId);
    if (recordErrors.length === 0) records.push({ file, record, requirement });
  }

  const covered = new Set(
    records
      .filter(({ record }) => record.commitSha === commitSha && record.overallResult === 'pass')
      .map(({ requirement }) => requirement.key),
  );
  const missing = requirements.filter((requirement) => !covered.has(requirement.key));
  const providerRequirements = requirements.filter(({ kind }) => kind === 'provider');
  const physicalRequirements = requirements.filter(({ kind }) => kind === 'physical');
  return {
    commitSha,
    files,
    errors,
    records,
    requirements,
    missing,
    provider: {
      covered: providerRequirements.filter(({ key }) => covered.has(key)).length,
      total: providerRequirements.length,
    },
    physical: {
      covered: physicalRequirements.filter(({ key }) => covered.has(key)).length,
      total: physicalRequirements.length,
    },
    complete: errors.length === 0 && missing.length === 0,
  };
};

const currentCommit = () =>
  execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();

const printUsage = () => {
  console.log(`Usage: node scripts/validate-pilot-qualification.mjs [options]

Options:
  --commit <40-char-sha>  Release-candidate commit (defaults to current HEAD)
  --records <directory>   Content-free evidence directory
  --manifest <file>       Required qualification matrix
  --verbose               List every missing requirement
  --help                  Show this help`);
};

const parseArguments = (arguments_) => {
  const options = {
    commitSha: undefined,
    recordsPath: DEFAULT_RECORDS_PATH,
    manifestPath: DEFAULT_MANIFEST_PATH,
    verbose: false,
  };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--help') return { help: true };
    if (argument === '--verbose') {
      options.verbose = true;
      continue;
    }
    if (['--commit', '--records', '--manifest'].includes(argument)) {
      const value = arguments_[index + 1];
      if (!value) throw new Error(`${argument} requires a value`);
      index += 1;
      if (argument === '--commit') options.commitSha = value;
      if (argument === '--records') options.recordsPath = path.resolve(value);
      if (argument === '--manifest') options.manifestPath = path.resolve(value);
      continue;
    }
    throw new Error(`Unknown option: ${argument}`);
  }
  options.commitSha ??= currentCommit();
  if (!COMMIT_SHA.test(options.commitSha)) {
    throw new Error('--commit must be a full lowercase 40-character Git SHA');
  }
  return options;
};

const run = async () => {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    printUsage();
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    printUsage();
    return;
  }

  const result = await inspectQualificationEvidence(options);
  console.log(`Pilot qualification evidence for commit ${result.commitSha}`);
  console.log(`Provider/local passes: ${result.provider.covered}/${result.provider.total}`);
  console.log(
    `Physical target/browser passes: ${result.physical.covered}/${result.physical.total}`,
  );
  console.log(`Evidence files inspected: ${result.files.length}`);

  if (result.errors.length > 0) {
    console.error('\nUnsafe or invalid evidence records:');
    result.errors.forEach((error) => console.error(`- ${error}`));
  }
  if (result.missing.length > 0) {
    console.error(`\nPending requirements: ${result.missing.length}`);
    if (options.verbose) {
      result.missing.forEach((requirement) => console.error(`- ${requirement.key}`));
    } else {
      console.error('Run with --verbose to list every pending requirement.');
    }
  }

  if (result.complete) {
    console.log('\nPilot qualification gate: PASS');
  } else {
    console.error('\nPilot qualification gate: OPEN');
    process.exitCode = 1;
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await run();
}
