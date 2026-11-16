import { emptyStats, type Stats } from '../../Achievements-Engine';

const counterKeys = [
  'gamesPlayed',
  'millionWins',
  'millionWinsNoLifelines',
  'millionWinsFast',
  'correctHard',
  'mistakeReviewTotal',
  'insiderLateWin',
  'againstConsensus',
  'stopLossWin',
  'marginCallWin',
  'weekendGames',
  'nightMillionWins',
  'reached5',
  'reached10NoLifelines',
  'caffeineTrader',
] as const;

const countMapKeys = [
  'failOnQuestionCount',
  'failSameQuestionCount',
  'correctByCategory',
  'correctByTag',
] as const;

export function normalizeStats(value: unknown): Stats {
  const defaults = emptyStats();
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return defaults;

  const source = value as Partial<Stats>;
  const normalized = { ...defaults };

  for (const key of counterKeys) {
    const count = source[key];
    normalized[key] = typeof count === 'number' && Number.isFinite(count) && count >= 0
      ? count
      : defaults[key];
  }

  for (const key of countMapKeys) {
    const sourceMap = source[key];
    if (typeof sourceMap !== 'object' || sourceMap === null || Array.isArray(sourceMap)) continue;
    normalized[key] = Object.fromEntries(
      Object.entries(sourceMap).filter(
        (entry): entry is [string, number] =>
          typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] >= 0,
      ),
    );
  }

  for (const key of ['millionWinSeeds', 'uniqueCorrectIds', 'mistakeIds'] as const) {
    const items = source[key];
    normalized[key] = Array.isArray(items)
      ? [...new Set(items.filter((item): item is string => typeof item === 'string'))]
      : defaults[key];
  }

  const unlocked = source.unlocked;
  if (typeof unlocked === 'object' && unlocked !== null && !Array.isArray(unlocked)) {
    normalized.unlocked = Object.fromEntries(
      Object.entries(unlocked).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    );
  }

  return normalized;
}

export function mergeStats(...values: Stats[]): Stats {
  const normalized = values.map(normalizeStats);
  const result = emptyStats();

  for (const key of counterKeys) {
    result[key] = Math.max(...normalized.map((stats) => stats[key]));
  }

  for (const key of countMapKeys) {
    const merged: Record<string, number> = {};
    for (const stats of normalized) {
      for (const [id, count] of Object.entries(stats[key])) {
        merged[id] = Math.max(merged[id] ?? 0, count);
      }
    }
    result[key] = merged;
  }

  for (const key of ['millionWinSeeds', 'uniqueCorrectIds', 'mistakeIds'] as const) {
    result[key] = [...new Set(normalized.flatMap((stats) => stats[key]))];
  }

  result.mistakeIds = result.mistakeIds.filter((id) => !result.uniqueCorrectIds.includes(id));
  result.unlocked = Object.assign({}, ...normalized.map((stats) => stats.unlocked));
  return result;
}
