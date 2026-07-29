import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  expandQualificationRequirements,
  inspectQualificationEvidence,
  validateEvidenceRecord,
} from './validate-pilot-qualification.mjs';

const MANIFEST_PATH = path.resolve('docs/qualification/required-matrix.json');
const COMMIT_SHA = '0123456789abcdef0123456789abcdef01234567';
const temporaryRoots = [];

const createRecord = (requirement) => ({
  schemaVersion: 1,
  evidenceId: 'local-no-key-chromium-2030-01-01',
  requirementId: requirement.key,
  recordedAt: '2030-01-01T12:00:00.000Z',
  commitSha: COMMIT_SHA,
  accountEnvironmentClass: requirement.accountEnvironmentClass,
  accessMode: requirement.accessMode,
  configurationId: requirement.configurationId,
  environment: {
    deviceClass: 'Desktop test class',
    osName: 'Test OS',
    osVersion: '1.0',
    browserName: 'Test Browser',
    browserVersion: '1.0',
  },
  roles: [
    'Credential Custodian',
    'Billing Authorizer',
    'Evidence Recorder',
    'Support & Escalation Owner',
  ],
  checks: requirement.checks.map((id) => ({
    id,
    result: 'pass',
    safeCode: 'ok',
    durationMs: 1_000,
    clipDurationSeconds: null,
    mimeType: null,
  })),
  overallResult: 'pass',
});

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('pilot qualification evidence', () => {
  it('expands the approved provider and physical-browser matrix without collapsing targets', async () => {
    const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
    const requirements = expandQualificationRequirements(manifest);

    expect(requirements.filter(({ kind }) => kind === 'provider')).toHaveLength(7);
    expect(requirements.filter(({ kind }) => kind === 'physical')).toHaveLength(45);
    expect(new Set(requirements.map(({ key }) => key)).size).toBe(52);
  });

  it('accepts only the exact content-free fields and app-owned configuration', async () => {
    const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
    const requirement = expandQualificationRequirements(manifest).find(
      ({ key }) => key === 'provider:local-no-key',
    );
    expect(requirement).toBeDefined();
    if (!requirement) return;

    const record = createRecord(requirement);
    expect(validateEvidenceRecord(record, requirement)).toEqual([]);

    expect(
      validateEvidenceRecord(
        {
          ...record,
          prompt: 'content that must never enter an evidence record',
        },
        requirement,
      ),
    ).toContain(
      'record must contain exactly: accessMode, accountEnvironmentClass, checks, commitSha, configurationId, environment, evidenceId, overallResult, recordedAt, requirementId, roles, schemaVersion',
    );
    expect(
      validateEvidenceRecord(
        { ...record, configurationId: 'decart:lucy-vton-latest' },
        requirement,
      ),
    ).toContain(`record.configurationId must equal ${requirement.configurationId}`);
  });

  it('reports partial same-commit coverage without treating blocked evidence as a pass', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'lightframe-qualification-'));
    temporaryRoots.push(root);
    const recordsPath = path.join(root, 'evidence');
    await mkdir(recordsPath);

    const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
    const requirement = expandQualificationRequirements(manifest).find(
      ({ key }) => key === 'provider:local-no-key',
    );
    expect(requirement).toBeDefined();
    if (!requirement) return;

    const record = createRecord(requirement);
    await writeFile(path.join(recordsPath, 'local-no-key.json'), JSON.stringify(record));
    const partial = await inspectQualificationEvidence({
      manifestPath: MANIFEST_PATH,
      recordsPath,
      commitSha: COMMIT_SHA,
    });

    expect(partial.errors).toEqual([]);
    expect(partial.provider).toEqual({ covered: 1, total: 7 });
    expect(partial.physical).toEqual({ covered: 0, total: 45 });
    expect(partial.complete).toBe(false);

    record.overallResult = 'blocked';
    record.checks = record.checks.map((check) => ({ ...check, result: 'blocked' }));
    await writeFile(path.join(recordsPath, 'local-no-key.json'), JSON.stringify(record));
    const blocked = await inspectQualificationEvidence({
      manifestPath: MANIFEST_PATH,
      recordsPath,
      commitSha: COMMIT_SHA,
    });
    expect(blocked.provider.covered).toBe(0);
    expect(blocked.complete).toBe(false);
  });
});
