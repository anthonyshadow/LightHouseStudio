// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  forgetUploadKey,
  rememberUploadKey,
  rememberedUploadKey,
  uploadFingerprint,
  uploadResumeStore,
} from './uploadResumeStorage';

const ownerUserId = '11111111-1111-4111-8111-111111111111';
const otherOwnerUserId = '22222222-2222-4222-8222-222222222222';
const key = (n: number) => `3333333${n}-3333-4333-8333-333333333333`;
const now = Date.parse('2026-09-05T12:00:00.000Z');

describe('upload resume keys', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('names the same file the same way, and two different files differently', () => {
    const file = new File([new Uint8Array(8)], 'clip.mp4', {
      type: 'video/mp4',
      lastModified: 1_700_000_000_000,
    });
    const same = new File([new Uint8Array(8)], 'clip.mp4', {
      type: 'video/mp4',
      lastModified: 1_700_000_000_000,
    });
    expect(uploadFingerprint(file, file.name, 'save')).toBe(
      uploadFingerprint(same, same.name, 'save'),
    );
    // The same bytes for a different operation are a different upload.
    expect(uploadFingerprint(file, file.name, 'save')).not.toBe(
      uploadFingerprint(file, file.name, 'replace'),
    );
    expect(uploadFingerprint(file, file.name, 'save')).not.toBe(
      uploadFingerprint(
        new File([new Uint8Array(9)], 'clip.mp4', { type: 'video/mp4' }),
        'clip.mp4',
        'save',
      ),
    );
  });

  it('gives a later attempt at the same bytes the key the first one used', () => {
    rememberUploadKey(ownerUserId, {
      fingerprint: 'save:clip.mp4:8:video/mp4:0',
      idempotencyKey: key(1),
      mintedAt: new Date(now).toISOString(),
    });
    expect(rememberedUploadKey(ownerUserId, 'save:clip.mp4:8:video/mp4:0', now + 1_000)).toBe(
      key(1),
    );
    // Another person's browser storage is a different record entirely.
    expect(rememberedUploadKey(otherOwnerUserId, 'save:clip.mp4:8:video/mp4:0', now)).toBeNull();
    expect(rememberedUploadKey(ownerUserId, 'save:other.mp4:8:video/mp4:0', now)).toBeNull();
  });

  it('stops offering a key once the staged upload it names has expired', () => {
    rememberUploadKey(ownerUserId, {
      fingerprint: 'save:clip.mp4:8:video/mp4:0',
      idempotencyKey: key(2),
      mintedAt: new Date(now).toISOString(),
    });
    const twoDays = 48 * 60 * 60 * 1000;
    expect(
      rememberedUploadKey(ownerUserId, 'save:clip.mp4:8:video/mp4:0', now + twoDays),
    ).toBeNull();
  });

  it('forgets a finished upload, and keeps the others', () => {
    for (const [index, name] of ['a', 'b'].entries()) {
      rememberUploadKey(ownerUserId, {
        fingerprint: `save:${name}.mp4:8:video/mp4:0`,
        idempotencyKey: key(index + 3),
        mintedAt: new Date(now).toISOString(),
      });
    }
    forgetUploadKey(ownerUserId, 'save:a.mp4:8:video/mp4:0');
    expect(rememberedUploadKey(ownerUserId, 'save:a.mp4:8:video/mp4:0', now)).toBeNull();
    expect(rememberedUploadKey(ownerUserId, 'save:b.mp4:8:video/mp4:0', now)).toBe(key(4));
    forgetUploadKey(ownerUserId, 'save:b.mp4:8:video/mp4:0');
    expect(uploadResumeStore.load(ownerUserId)).toBeNull();
  });

  it('keeps only the most recent uploads, and ignores a record it cannot trust', () => {
    for (let index = 0; index < 10; index += 1) {
      rememberUploadKey(ownerUserId, {
        fingerprint: `save:clip-${index}.mp4:8:video/mp4:0`,
        idempotencyKey: key(index % 9),
        mintedAt: new Date(now + index).toISOString(),
      });
    }
    expect(uploadResumeStore.load(ownerUserId)).toHaveLength(8);
    expect(
      rememberedUploadKey(ownerUserId, 'save:clip-9.mp4:8:video/mp4:0', now + 10),
    ).not.toBeNull();
    expect(rememberedUploadKey(ownerUserId, 'save:clip-0.mp4:8:video/mp4:0', now + 10)).toBeNull();

    window.localStorage.setItem(
      uploadResumeStore.storageKey(ownerUserId),
      JSON.stringify({ version: 1, payload: [{ fingerprint: 'x', idempotencyKey: 'not-a-uuid' }] }),
    );
    expect(uploadResumeStore.load(ownerUserId)).toBeNull();
  });
});
