import type { DecryptedMemory } from '@memoir/shared';

export interface StreakStats {
  currentStreak: number;
  longestStreak: number;
  totalActiveDays: number;
}

export interface MoodStat {
  mood: string;
  count: number;
  percentage: number;
  color: string;
}

export interface TagStat {
  tag: string;
  count: number;
}

export interface WeekdayStat {
  day: string;
  count: number;
}

export interface InsightsData {
  totalMemories: number;
  totalWords: number;
  streaks: StreakStats;
  moodDistribution: MoodStat[];
  topTags: TagStat[];
  weekdayDistribution: WeekdayStat[];
  anniversaryMemories: DecryptedMemory[];
}

// Curated Archival Palette for moods
export const MOOD_PALETTE: Record<string, string> = {
  calm: '#708A81', // Archival Sage
  peaceful: '#8FA89F',
  happy: '#D49A3D', // Warm Ochre
  joyful: '#E5AC54',
  reflective: '#64748B', // Archival Slate
  thoughtful: '#788896',
  anxious: '#C26751', // Terracotta
  stressed: '#B85D76', // Deep Rose
  sad: '#8E9AAF', // Muted Denim
  melancholy: '#5C677D',
  energetic: '#E07A5F', // Burnt Orange
  neutral: '#A5A9B8', // Neutral Slate
};

const DEFAULT_MOOD_COLOR = '#8FA89F';

/**
 * Normalizes an ISO date string to local YYYY-MM-DD
 */
export function toLocalDateString(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Computes current and longest writing streaks (consecutive days) in 100% RAM
 */
export function calculateStreaks(dates: string[]): StreakStats {
  if (dates.length === 0) {
    return { currentStreak: 0, longestStreak: 0, totalActiveDays: 0 };
  }

  // Deduplicate dates to unique YYYY-MM-DD
  const uniqueDays = Array.from(new Set(dates.map((d) => toLocalDateString(d)))).sort();
  const totalActiveDays = uniqueDays.length;

  if (totalActiveDays === 0) {
    return { currentStreak: 0, longestStreak: 0, totalActiveDays: 0 };
  }

  let longest = 1;
  let currentRun = 1;

  for (let i = 1; i < uniqueDays.length; i++) {
    const prev = new Date(uniqueDays[i - 1]!);
    const curr = new Date(uniqueDays[i]!);
    const diffMs = curr.getTime() - prev.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      currentRun++;
      if (currentRun > longest) {
        longest = currentRun;
      }
    } else {
      currentRun = 1;
    }
  }

  // Calculate current streak relative to today
  const todayStr = toLocalDateString(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = toLocalDateString(yesterday);

  const lastRecordedDay = uniqueDays[uniqueDays.length - 1]!;
  let currentStreak = 0;

  if (lastRecordedDay === todayStr || lastRecordedDay === yesterdayStr) {
    currentStreak = 1;
    for (let i = uniqueDays.length - 1; i > 0; i--) {
      const curr = new Date(uniqueDays[i]!);
      const prev = new Date(uniqueDays[i - 1]!);
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  return {
    currentStreak,
    longestStreak: Math.max(longest, currentStreak),
    totalActiveDays,
  };
}

/**
 * Counts total words across decrypted memory markdown bodies
 */
export function calculateTotalWords(memories: { bodyMarkdown?: string }[]): number {
  let count = 0;
  for (const m of memories) {
    if (m.bodyMarkdown && m.bodyMarkdown.trim().length > 0) {
      const words = m.bodyMarkdown.trim().split(/\s+/).filter(Boolean);
      count += words.length;
    }
  }
  return count;
}

/**
 * Aggregates mood distribution percentages
 */
export function calculateMoodDistribution(memories: { mood?: string | null }[]): MoodStat[] {
  const counts: Record<string, number> = {};
  let totalWithMood = 0;

  for (const m of memories) {
    if (m.mood && m.mood.trim()) {
      const cleanMood = m.mood.trim().toLowerCase();
      counts[cleanMood] = (counts[cleanMood] || 0) + 1;
      totalWithMood++;
    }
  }

  if (totalWithMood === 0) return [];

  return Object.entries(counts)
    .map(([mood, count]) => ({
      mood: mood.charAt(0).toUpperCase() + mood.slice(1),
      count,
      percentage: Math.round((count / totalWithMood) * 100),
      color: MOOD_PALETTE[mood.toLowerCase()] || DEFAULT_MOOD_COLOR,
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Aggregates tag frequencies
 */
export function calculateTagFrequency(memories: { tags?: string[] }[]): TagStat[] {
  const counts: Record<string, number> = {};

  for (const m of memories) {
    if (m.tags && Array.isArray(m.tags)) {
      for (const t of m.tags) {
        const cleanTag = t.trim().toLowerCase();
        if (cleanTag) {
          counts[cleanTag] = (counts[cleanTag] || 0) + 1;
        }
      }
    }
  }

  return Object.entries(counts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);
}

/**
 * Aggregates entries by day of week
 */
export function calculateWeekdayDistribution(memories: { entryDate: string }[]): WeekdayStat[] {
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const counts = [0, 0, 0, 0, 0, 0, 0];

  for (const m of memories) {
    const d = new Date(m.entryDate);
    if (!isNaN(d.getTime())) {
      counts[d.getDay()]!++;
    }
  }

  return weekdays.map((day, idx) => ({
    day,
    count: counts[idx] ?? 0,
  }));
}

/**
 * Finds memories written on this exact day and month in previous years (strictly client-side)
 */
export function getAnniversaryMemories(
  memories: DecryptedMemory[],
  referenceDate: Date = new Date(),
): DecryptedMemory[] {
  const refMonth = referenceDate.getMonth();
  const refDay = referenceDate.getDate();
  const refYear = referenceDate.getFullYear();

  return memories.filter((m) => {
    if (m.isLockedTimeCapsule) return false;
    const entryDate = new Date(m.entryDate);
    if (isNaN(entryDate.getTime())) return false;

    return (
      entryDate.getMonth() === refMonth &&
      entryDate.getDate() === refDay &&
      entryDate.getFullYear() < refYear
    );
  });
}

/**
 * Computes consolidated insights data in memory
 */
export function computeInsights(memories: DecryptedMemory[]): InsightsData {
  const nonLocked = memories.filter((m) => !m.isLockedTimeCapsule);

  return {
    totalMemories: memories.length,
    totalWords: calculateTotalWords(nonLocked),
    streaks: calculateStreaks(memories.map((m) => m.entryDate)),
    moodDistribution: calculateMoodDistribution(nonLocked),
    topTags: calculateTagFrequency(nonLocked),
    weekdayDistribution: calculateWeekdayDistribution(memories),
    anniversaryMemories: getAnniversaryMemories(memories),
  };
}
