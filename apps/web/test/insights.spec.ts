import { describe, expect, it } from 'vitest';
import type { DecryptedMemory } from '@memoir/shared';
import {
  calculateMoodDistribution,
  calculateStreaks,
  calculateTagFrequency,
  calculateTotalWords,
  calculateWeekdayDistribution,
  computeInsights,
  getAnniversaryMemories,
  MOOD_PALETTE,
} from '../src/services/insightsService.js';

describe('Client-Side Mood Insights, Time Capsules & Private Anniversary Reminders', () => {
  it('1. Accurately calculates writing streaks, handling multiple entries per day and gap resets', () => {
    // Empty case
    expect(calculateStreaks([])).toEqual({
      currentStreak: 0,
      longestStreak: 0,
      totalActiveDays: 0,
    });

    // 3 consecutive days ending today
    const today = new Date();
    const d1 = new Date(today);
    d1.setDate(today.getDate() - 2);
    const d2 = new Date(today);
    d2.setDate(today.getDate() - 1);
    const d3 = new Date(today);

    // Duplicate entries on day 2
    const dates = [
      d1.toISOString(),
      d2.toISOString(),
      d2.toISOString(), // Duplicate same day
      d3.toISOString(),
    ];

    const stats = calculateStreaks(dates);
    expect(stats.currentStreak).toBe(3);
    expect(stats.longestStreak).toBe(3);
    expect(stats.totalActiveDays).toBe(3);

    // Historical streak with a gap before today
    const oldD1 = '2026-01-01T10:00:00.000Z';
    const oldD2 = '2026-01-02T10:00:00.000Z';
    const oldD3 = '2026-01-03T10:00:00.000Z';
    const oldD4 = '2026-01-04T10:00:00.000Z';
    const gapDate = '2026-02-10T10:00:00.000Z'; // Broke streak

    const historicalStats = calculateStreaks([oldD1, oldD2, oldD3, oldD4, gapDate]);
    expect(historicalStats.longestStreak).toBe(4);
    expect(historicalStats.currentStreak).toBe(0); // Inactive today
    expect(historicalStats.totalActiveDays).toBe(5);
  });

  it('2. Computes total words across decrypted markdown bodies', () => {
    const memories = [
      { bodyMarkdown: 'Hello world from Memoir diary.' }, // 5 words
      { bodyMarkdown: '  Multiple    spaces   between words   are  handled.  ' }, // 6 words
      { bodyMarkdown: '' }, // 0 words
      { bodyMarkdown: '# Heading\n\n- Bullet 1\n- Bullet 2' }, // 5 words
    ];

    const total = calculateTotalWords(memories);
    expect(total).toBe(19);
  });

  it('3. Computes mood distribution with percentages and Archival palette mapping', () => {
    const memories = [
      { mood: 'calm' },
      { mood: 'calm' },
      { mood: 'reflective' },
      { mood: 'happy' },
      { mood: null },
      { mood: '' },
    ];

    const distribution = calculateMoodDistribution(memories);
    expect(distribution).toHaveLength(3);

    // Calm: 2/4 = 50%
    const calm = distribution.find((m) => m.mood === 'Calm');
    expect(calm).toBeDefined();
    expect(calm?.count).toBe(2);
    expect(calm?.percentage).toBe(50);
    expect(calm?.color).toBe(MOOD_PALETTE.calm);

    // Reflective: 1/4 = 25%
    const reflective = distribution.find((m) => m.mood === 'Reflective');
    expect(reflective?.count).toBe(1);
    expect(reflective?.percentage).toBe(25);
    expect(reflective?.color).toBe(MOOD_PALETTE.reflective);

    // Happy: 1/4 = 25%
    const happy = distribution.find((m) => m.mood === 'Happy');
    expect(happy?.count).toBe(1);
    expect(happy?.percentage).toBe(25);
    expect(happy?.color).toBe(MOOD_PALETTE.happy);
  });

  it('4. Aggregates private tag frequencies and weekday distributions', () => {
    const memories = [
      { tags: ['nature', 'walk', 'gardening'] },
      { tags: ['nature', 'reading'] },
      { tags: ['nature'] },
      { tags: [] },
    ];

    const tags = calculateTagFrequency(memories);
    expect(tags[0]?.tag).toBe('nature');
    expect(tags[0]?.count).toBe(3);

    // Weekday distribution has 7 days (Sun-Sat)
    const weekStats = calculateWeekdayDistribution([
      { entryDate: '2026-11-22T12:00:00.000Z' }, // Sunday
      { entryDate: '2026-11-23T12:00:00.000Z' }, // Monday
      { entryDate: '2026-11-23T15:00:00.000Z' }, // Monday again
    ]);

    expect(weekStats).toHaveLength(7);
    const sunday = weekStats.find((w) => w.day === 'Sun');
    const monday = weekStats.find((w) => w.day === 'Mon');
    expect(sunday?.count).toBe(1);
    expect(monday?.count).toBe(2);
  });

  it('5. Strictly matches "On This Day" anniversary reflections from previous years in RAM', () => {
    const referenceDate = new Date('2026-11-24T12:00:00.000Z');

    const dummyMemories: DecryptedMemory[] = [
      {
        id: 'anniv-1-year-ago',
        userId: 'u1',
        title: 'One Year Ago Today',
        bodyMarkdown: 'A beautiful autumn walk in 2025.',
        mood: 'calm',
        tags: ['autumn'],
        schemaVersion: 1,
        entryDate: '2025-11-24T09:00:00.000Z', // Matches month & day, year < 2026
        createdAt: '2025-11-24T09:00:00.000Z',
        updatedAt: '2025-11-24T09:00:00.000Z',
        isPinned: false,
        archivedAt: null,
        envelopeVersion: 1,
        algorithm: 'AES-256-GCM',
        isTimeCapsule: false,
        unlockAt: null,
      },
      {
        id: 'anniv-2-years-ago',
        userId: 'u1',
        title: 'Two Years Ago Today',
        bodyMarkdown: 'Cold breeze in 2024.',
        mood: 'reflective',
        tags: ['winter'],
        schemaVersion: 1,
        entryDate: '2024-11-24T14:30:00.000Z', // Matches month & day, year < 2026
        createdAt: '2024-11-24T14:30:00.000Z',
        updatedAt: '2024-11-24T14:30:00.000Z',
        isPinned: false,
        archivedAt: null,
        envelopeVersion: 1,
        algorithm: 'AES-256-GCM',
        isTimeCapsule: false,
        unlockAt: null,
      },
      {
        id: 'today-memory-current-year',
        userId: 'u1',
        title: 'Written Today',
        bodyMarkdown: 'Entry written today in 2026.',
        mood: 'energetic',
        tags: [],
        schemaVersion: 1,
        entryDate: '2026-11-24T08:00:00.000Z', // Current year -> NOT an anniversary
        createdAt: '2026-11-24T08:00:00.000Z',
        updatedAt: '2026-11-24T08:00:00.000Z',
        isPinned: false,
        archivedAt: null,
        envelopeVersion: 1,
        algorithm: 'AES-256-GCM',
        isTimeCapsule: false,
        unlockAt: null,
      },
      {
        id: 'locked-capsule-anniversary',
        userId: 'u1',
        title: 'Locked Capsule',
        bodyMarkdown: '',
        mood: null,
        tags: [],
        schemaVersion: 1,
        entryDate: '2025-11-24T10:00:00.000Z',
        createdAt: '2025-11-24T10:00:00.000Z',
        updatedAt: '2025-11-24T10:00:00.000Z',
        isPinned: false,
        archivedAt: null,
        envelopeVersion: 1,
        algorithm: 'AES-256-GCM',
        isTimeCapsule: true,
        isLockedTimeCapsule: true, // Locked -> must be excluded from anniversary card
        unlockAt: '2027-01-01T00:00:00.000Z',
      },
      {
        id: 'different-day',
        userId: 'u1',
        title: 'Written yesterday in 2025',
        bodyMarkdown: 'November 23rd in 2025.',
        mood: 'calm',
        tags: [],
        schemaVersion: 1,
        entryDate: '2025-11-23T12:00:00.000Z', // Different day -> NOT an anniversary
        createdAt: '2025-11-23T12:00:00.000Z',
        updatedAt: '2025-11-23T12:00:00.000Z',
        isPinned: false,
        archivedAt: null,
        envelopeVersion: 1,
        algorithm: 'AES-256-GCM',
        isTimeCapsule: false,
        unlockAt: null,
      },
    ];

    const anniversaries = getAnniversaryMemories(dummyMemories, referenceDate);
    expect(anniversaries).toHaveLength(2);
    expect(anniversaries.map((a) => a.id)).toEqual(['anniv-1-year-ago', 'anniv-2-years-ago']);
  });

  it('6. Invariant Guarantee: computeInsights operates 100% in local RAM with zero side-effects', () => {
    const dummyMemories: DecryptedMemory[] = [
      {
        id: '1',
        userId: 'u1',
        title: 'Secret Thought',
        bodyMarkdown: 'A confidential diary reflection strictly in RAM.',
        mood: 'peaceful',
        tags: ['serenity'],
        schemaVersion: 1,
        entryDate: '2026-11-24T09:00:00.000Z',
        createdAt: '2026-11-24T09:00:00.000Z',
        updatedAt: '2026-11-24T09:00:00.000Z',
        isPinned: false,
        archivedAt: null,
        envelopeVersion: 1,
        algorithm: 'AES-256-GCM',
        isTimeCapsule: false,
        unlockAt: null,
      },
    ];

    const result = computeInsights(dummyMemories);
    expect(result.totalMemories).toBe(1);
    expect(result.totalWords).toBe(7);
    expect(result.moodDistribution[0]?.mood).toBe('Peaceful');
    expect(result.topTags[0]?.tag).toBe('serenity');
    expect(result.streaks.totalActiveDays).toBe(1);
  });
});
