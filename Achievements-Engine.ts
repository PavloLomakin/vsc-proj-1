// Движок ачивок: чистые функции + AsyncStorage.
// Никакой магии: игра вызывает recordGameEvent() после каждой партии,
// а UI читает getProgress() и показывает тост при разблокировке.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ACHIEVEMENTS, type Achievement } from '@/data/achievements';
import type { QuizQuestion } from '@/data/questions';

export type LifelineId = 'insider' | 'consensus' | 'stoploss';
export type GameMode = 'millionaire' | 'radar' | 'mistakes';

export type GameEvent = {
  // Что произошло в партии — движок сам посчитает все ачивки из этого
  questionIds: string[]; // вопросы партии, по порядку
  questions: QuizQuestion[]; // те же вопросы, для категорий/тегов/сложности
  correctIndices: boolean[]; // верно/неверно по каждому вопросу
  gameMode: GameMode;
  usedLifelines: LifelineId[]; // какие подсказки потрачены
  lifelineQuestionById: Partial<Record<LifelineId, number>>; // на каком вопросе (1-based) потрачена
  consensusWasWrong: boolean; // Консенсус ошибся в этой партии
  pickedAgainstConsensus: boolean; // игрок пошёл вопреки Консенсусу и был прав
  stopLossSavedOnQuestion: number | null; // на каком вопросе сработал Стоп-лосс
  durationMs: number; // длительность партии
  answerMsPerQuestion: number[]; // время на каждый ответ
  startedAt: Date;
  finishedAt: Date;
  result: 'won' | 'lost' | 'walkaway';
  correctCount: number; // сколько верных в партии
  failQuestionNumber: number | null; // на каком вопросе вылетел (1-based), null если не вылетел
  failedQuestionId?: string | null;
  mistakeReviewCount?: number; // сколько вопросов переиграно в Портфеле промахов в этой сессии
};

export type Stats = {
  gamesPlayed: number;
  totalCorrectAnswers: number;
  millionWins: number;
  millionWinsNoLifelines: number;
  millionWinsFast: number;
  millionWinSeeds: string[]; // для «Серийный миллионер»
  failOnQuestionCount: Record<string, number>; // questionNumber -> раз
  failSameQuestionCount: Record<string, number>; // questionId -> раз
  correctByCategory: Record<string, number>;
  correctByTag: Record<string, number>;
  correctHard: number;
  uniqueCorrectIds: string[];
  mistakeIds: string[]; // Портфель промахов: id вопросов, где был промах и ещё не отработан
  mistakeReviewTotal: number;
  insiderLateWin: number;
  againstConsensus: number;
  stopLossWin: number;
  marginCallWin: number;
  weekendGames: number;
  nightMillionWins: number;
  reached5: number;
  reached10NoLifelines: number;
  caffeineTrader: number;
  unlocked: Record<string, string>; // achievementId -> ISO дата разблокировки
};

const KEY = 'invest-m:stats:v1';
const GUEST_MIGRATION_KEY = `${KEY}:guest-migrated-to`;

function getStatsKey(userId?: string) {
  return userId === undefined ? KEY : `${KEY}:user:${encodeURIComponent(userId)}`;
}

export const emptyStats = (): Stats => ({
  gamesPlayed: 0, totalCorrectAnswers: 0, millionWins: 0, millionWinsNoLifelines: 0, millionWinsFast: 0,
  millionWinSeeds: [], failOnQuestionCount: {}, failSameQuestionCount: {},
  correctByCategory: {}, correctByTag: {}, correctHard: 0, uniqueCorrectIds: [],
  mistakeIds: [], mistakeReviewTotal: 0, insiderLateWin: 0, againstConsensus: 0,
  stopLossWin: 0, marginCallWin: 0, weekendGames: 0, nightMillionWins: 0,
  reached5: 0, reached10NoLifelines: 0, caffeineTrader: 0, unlocked: {},
});

export async function loadStats(userId?: string): Promise<Stats> {
  const raw = await AsyncStorage.getItem(getStatsKey(userId));
  if (!raw) return emptyStats();
  const stored = JSON.parse(raw) as Partial<Stats>;
  const defaults = emptyStats();
  return {
    ...defaults,
    ...stored,
    failOnQuestionCount: stored.failOnQuestionCount ?? defaults.failOnQuestionCount,
    failSameQuestionCount: stored.failSameQuestionCount ?? defaults.failSameQuestionCount,
    correctByCategory: stored.correctByCategory ?? defaults.correctByCategory,
    correctByTag: stored.correctByTag ?? defaults.correctByTag,
    uniqueCorrectIds: stored.uniqueCorrectIds ?? defaults.uniqueCorrectIds,
    mistakeIds: stored.mistakeIds ?? defaults.mistakeIds,
    unlocked: stored.unlocked ?? defaults.unlocked,
  };
}

export async function saveStats(s: Stats, userId?: string) {
  await AsyncStorage.setItem(getStatsKey(userId), JSON.stringify(s));
}

export async function getGuestMigrationTarget() {
  return AsyncStorage.getItem(GUEST_MIGRATION_KEY);
}

export async function setGuestMigrationTarget(userId: string) {
  await AsyncStorage.setItem(GUEST_MIGRATION_KEY, userId);
}

// Главная функция: скармливаем ей итог партии, она возвращает обновлённые статы + новые ачивки
export function applyGameEvent(prev: Stats, ev: GameEvent, gameSeed: string): { stats: Stats; newlyUnlocked: Achievement[] } {
  const s: Stats = JSON.parse(JSON.stringify(prev)) as Stats;
  s.gamesPlayed += 1;
  s.totalCorrectAnswers += ev.correctIndices.filter(Boolean).length;

  // Уникальные верные + Портфель промахов
  ev.questions.forEach((q, i) => {
    if (ev.correctIndices[i]) {
      if (!s.uniqueCorrectIds.includes(q.id)) s.uniqueCorrectIds.push(q.id);
      s.mistakeIds = s.mistakeIds.filter((id) => id !== q.id); // отработал промах
      s.correctByCategory[q.category] = (s.correctByCategory[q.category] ?? 0) + 1;
      for (const t of q.tags) s.correctByTag[t] = (s.correctByTag[t] ?? 0) + 1;
      if (q.difficulty >= 4) s.correctHard += 1;
    } else {
      if (!s.mistakeIds.includes(q.id)) s.mistakeIds.push(q.id);
    }
  });

  if (ev.mistakeReviewCount) s.mistakeReviewTotal += ev.mistakeReviewCount;

  // Лестничные ачивки относятся только к классическому режиму.
  if (ev.gameMode === 'millionaire' && ev.correctCount >= 5) s.reached5 += 1;
  if (ev.gameMode === 'millionaire' && ev.correctCount >= 10 && ev.usedLifelines.length === 0) s.reached10NoLifelines += 1;
  if (ev.gameMode === 'millionaire' && ev.result === 'won') {
    s.millionWins += 1;
    if (ev.usedLifelines.length === 0) s.millionWinsNoLifelines += 1;
    if (ev.durationMs < 3 * 60 * 1000) s.millionWinsFast += 1;
    if (!s.millionWinSeeds.includes(gameSeed)) s.millionWinSeeds.push(gameSeed);
    const hour = ev.finishedAt.getHours();
    if (hour >= 1 && hour < 5) s.nightMillionWins += 1;
    const insiderQuestion = ev.lifelineQuestionById.insider;
    if (insiderQuestion !== undefined && insiderQuestion >= 13) s.insiderLateWin += 1;
    if (ev.stopLossSavedOnQuestion !== null && ev.stopLossSavedOnQuestion >= 11 && ev.stopLossSavedOnQuestion <= 14) s.stopLossWin += 1;
    const allSpentEarly = ev.usedLifelines.length === 3 && (ev.lifelineQuestionById.insider ?? 99) < 10 && (ev.lifelineQuestionById.consensus ?? 99) < 10 && (ev.lifelineQuestionById.stoploss ?? 99) < 10;
    if (allSpentEarly) s.marginCallWin += 1;
  }
  if (ev.gameMode === 'millionaire' && ev.pickedAgainstConsensus && ev.consensusWasWrong) s.againstConsensus += 1;

  // Пасхалки
  if (ev.gameMode === 'millionaire' && ev.failQuestionNumber !== null) {
    const k = String(ev.failQuestionNumber);
    s.failOnQuestionCount[k] = (s.failOnQuestionCount[k] ?? 0) + 1;
    const failId = ev.failedQuestionId ?? ev.questionIds[ev.failQuestionNumber - 1];
    if (failId) s.failSameQuestionCount[failId] = (s.failSameQuestionCount[failId] ?? 0) + 1;
  }
  const first5Fast = ev.answerMsPerQuestion.slice(0, 5).every((ms) => ms < 2000);
  if (ev.gameMode === 'millionaire' && first5Fast && ev.failQuestionNumber === 6) s.caffeineTrader += 1;
  const day = ev.startedAt.getDay();
  if (ev.gameMode === 'millionaire' && (day === 0 || day === 6)) s.weekendGames += 1;

  // Проверка разблокировок
  const newlyUnlocked: Achievement[] = [];
  for (const a of ACHIEVEMENTS) {
    if (s.unlocked[a.id]) continue;
    if (getProgress(s, a) >= a.target) {
      s.unlocked[a.id] = new Date().toISOString();
      newlyUnlocked.push(a);
    }
  }
  return { stats: s, newlyUnlocked };
}

export function getProgress(s: Stats, a: Achievement): number {
  const m = a.metric;
  switch (m.kind) {
    case 'gamesReached': return m.questionNumber === 5 ? s.reached5 : s.gamesPlayed; // reached5 уже считает игры до 5
    case 'gamesReachedNoLifelines': return s.reached10NoLifelines;
    case 'millionWins': return s.millionWins;
    case 'millionWinsNoLifelines': return s.millionWinsNoLifelines;
    case 'millionWinsFast': return s.millionWinsFast;
    case 'millionWinsDistinctSets': return s.millionWinSeeds.length;
    case 'failOnQuestion': return Math.max(...m.questionNumbers.map((n) => s.failOnQuestionCount[String(n)] ?? 0), 0);
    case 'fastAnswersThenFail': return s.caffeineTrader;
    case 'mistakeReview': return s.mistakeReviewTotal;
    case 'failSameQuestion':
      return Object.values(s.failSameQuestionCount).some((count) => count >= m.times) ? 1 : 0;
    case 'gamesOnWeekend': return s.weekendGames;
    case 'millionWinsAtNight': return s.nightMillionWins;
    case 'correctInCategory': return s.correctByCategory[m.category] ?? 0;
    case 'correctWithAnyTag': return m.tags.reduce((sum, t) => sum + (s.correctByTag[t] ?? 0), 0);
    case 'correctHard': return s.correctHard;
    case 'insiderOnLateQuestionAndWin': return s.insiderLateWin;
    case 'againstConsensusAndCorrect': return s.againstConsensus;
    case 'stopLossSavedAndWin': return s.stopLossWin;
    case 'millionWinAllLifelinesSpentEarly': return s.marginCallWin;
    case 'uniqueCorrect':
      return m.total >= 985
        ? s.uniqueCorrectIds.filter((id) => !s.mistakeIds.includes(id)).length
        : s.uniqueCorrectIds.length;
    default: return 0;
  }
}

export function getUnlockedAchievements(s: Stats) {
  return ACHIEVEMENTS.filter((a) => s.unlocked[a.id]);
}
