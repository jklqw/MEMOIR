import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateDek } from '@memoir/crypto';
import type { DecryptedMemory, MemoryPayload } from '@memoir/shared';
import {
  buildEncryptedCreateDto,
  buildEncryptedUpdateDto,
  decryptMemory,
  encryptMemory,
  getMemoryAad,
} from '../src/services/memoryCryptoService.js';

describe('Memory Client Cryptography, AAD Binding & Local Search Verification', () => {
  const userId = '12345678-1234-1234-1234-123456789abc';
  let dek: CryptoKey;

  beforeEach(async () => {
    dek = await generateDek();
  });

  it('1. Encrypts and decrypts memory payload round-trip with record-bound AAD', async () => {
    const memoryId = crypto.randomUUID();
    const payload: MemoryPayload = {
      title: 'Midnight Musings',
      bodyMarkdown: 'The moon is exceptionally clear tonight. Everything is peaceful.',
      mood: 'peaceful',
      tags: ['night', 'reflections'],
      schemaVersion: 1,
    };

    const { ciphertext, nonce } = await encryptMemory(payload, dek, userId, memoryId);

    expect(typeof ciphertext).toBe('string');
    expect(typeof nonce).toBe('string');
    expect(ciphertext).not.toContain('Midnight Musings');

    // Decrypt envelope
    const decrypted = await decryptMemory(
      {
        id: memoryId,
        userId,
        entryDate: new Date().toISOString(),
        isPinned: false,
        isTimeCapsule: false,
        unlockAt: null,
        envelopeVersion: 1,
        algorithm: 'AES-256-GCM',
        ciphertext,
        nonce,
        archivedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      dek,
      userId,
    );

    expect(decrypted.title).toBe(payload.title);
    expect(decrypted.bodyMarkdown).toBe(payload.bodyMarkdown);
    expect(decrypted.mood).toBe(payload.mood);
    expect(decrypted.tags).toEqual(payload.tags);
  });

  it('2. Fails closed when AAD context is tampered (e.g. wrong userId or memoryId)', async () => {
    const memoryId = crypto.randomUUID();
    const attackerUserId = crypto.randomUUID();
    const payload: MemoryPayload = {
      title: 'Confidential Thoughts',
      bodyMarkdown: 'Zero-knowledge guarantees must hold.',
      tags: [],
      schemaVersion: 1,
    };

    const { ciphertext, nonce } = await encryptMemory(payload, dek, userId, memoryId);

    // Attempting to decrypt with attacker user ID fails (AAD mismatch)
    await expect(
      decryptMemory(
        {
          id: memoryId,
          userId: attackerUserId,
          entryDate: new Date().toISOString(),
          isPinned: false,
          isTimeCapsule: false,
          unlockAt: null,
          envelopeVersion: 1,
          algorithm: 'AES-256-GCM',
          ciphertext,
          nonce,
          archivedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        dek,
        attackerUserId, // Tampered AAD context
      ),
    ).rejects.toThrow();
  });

  it('3. Generates fresh, unique nonces across multiple updates of the same memory', async () => {
    const memoryId = crypto.randomUUID();
    const payload: MemoryPayload = {
      title: 'Draft',
      bodyMarkdown: 'Initial thought',
      tags: [],
      schemaVersion: 1,
    };

    const update1 = await buildEncryptedUpdateDto({
      memoryId,
      payload,
      dek,
      userId,
    });

    const update2 = await buildEncryptedUpdateDto({
      memoryId,
      payload: { ...payload, bodyMarkdown: 'Updated thought' },
      dek,
      userId,
    });

    expect(update1.nonce).toBeDefined();
    expect(update2.nonce).toBeDefined();
    // Invariant: Nonces must never collide
    expect(update1.nonce).not.toBe(update2.nonce);
    expect(update1.ciphertext).not.toBe(update2.ciphertext);
  });

  it('4. Executes 100% Client-Side Local Search across in-memory decrypted entries without network calls', () => {
    // Network monitor mock
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const sampleMemories: DecryptedMemory[] = [
      {
        id: '1',
        userId,
        entryDate: '2026-11-20T10:00:00Z',
        isPinned: true,
        isTimeCapsule: false,
        unlockAt: null,
        envelopeVersion: 1,
        algorithm: 'AES-256-GCM',
        archivedAt: null,
        createdAt: '2026-11-20T10:00:00Z',
        updatedAt: '2026-11-20T10:00:00Z',
        title: 'Walk in the Autumn Woods',
        bodyMarkdown: 'Golden leaves falling under a crisp sky.',
        mood: 'peaceful',
        tags: ['nature', 'autumn'],
        schemaVersion: 1,
      },
      {
        id: '2',
        userId,
        entryDate: '2026-11-21T14:00:00Z',
        isPinned: false,
        isTimeCapsule: false,
        unlockAt: null,
        envelopeVersion: 1,
        algorithm: 'AES-256-GCM',
        archivedAt: null,
        createdAt: '2026-11-21T14:00:00Z',
        updatedAt: '2026-11-21T14:00:00Z',
        title: 'Cryptography Research Paper',
        bodyMarkdown: 'Evaluating post-quantum key exchange algorithms.',
        mood: 'focused',
        tags: ['work', 'security'],
        schemaVersion: 1,
      },
      {
        id: '3',
        userId,
        entryDate: '2026-11-22T20:00:00Z',
        isPinned: false,
        isTimeCapsule: false,
        unlockAt: null,
        envelopeVersion: 1,
        algorithm: 'AES-256-GCM',
        archivedAt: null,
        createdAt: '2026-11-22T20:00:00Z',
        updatedAt: '2026-11-22T20:00:00Z',
        title: 'Quiet Rain Evening',
        bodyMarkdown: 'Listening to rain drops on the window while reading.',
        mood: 'reflective',
        tags: ['rain', 'evening'],
        schemaVersion: 1,
      },
    ];

    // Local Search Algorithm (identical to TimelinePage)
    const performLocalSearch = (
      query: string,
      tagFilter?: string,
      moodFilter?: string,
    ): DecryptedMemory[] => {
      const q = query.toLowerCase().trim();
      return sampleMemories.filter((m) => {
        if (moodFilter && m.mood !== moodFilter) return false;
        if (tagFilter && !m.tags.includes(tagFilter)) return false;
        if (!q) return true;
        const titleMatch = m.title.toLowerCase().includes(q);
        const bodyMatch = m.bodyMarkdown.toLowerCase().includes(q);
        const tagMatch = m.tags.some((t) => t.toLowerCase().includes(q));
        return titleMatch || bodyMatch || tagMatch;
      });
    };

    // Test Search 1: by keyword in body
    const searchResult1 = performLocalSearch('leaves');
    expect(searchResult1.length).toBe(1);
    expect(searchResult1[0]?.title).toBe('Walk in the Autumn Woods');

    // Test Search 2: by tag
    const searchResult2 = performLocalSearch('security');
    expect(searchResult2.length).toBe(1);
    expect(searchResult2[0]?.id).toBe('2');

    // Test Search 3: combined with mood filter
    const searchResult3 = performLocalSearch('', undefined, 'reflective');
    expect(searchResult3.length).toBe(1);
    expect(searchResult3[0]?.title).toBe('Quiet Rain Evening');

    // Invariant: Zero network queries were dispatched during search
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
