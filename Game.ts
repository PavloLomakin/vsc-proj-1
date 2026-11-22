// Подбор вопросов для одной партии + чистые помощники для лестницы.
// Правило подбора (чтобы basics не забивала игру):
// - 15 вопросов: 5 лёгких (difficulty 1-2) + 5 средних (2-3) + 5 сложных (3-5)
// - не больше 3 вопросов из одной категории в партии
// - не повторять вопросы, на которые игрок уже отвечал верно в этой сессии, пока есть свежие
// - если включен «Портфель промахов» - брать только из промахов

import type { QuizQuestion } from '@/data/questions';

export type GameSet = {
  questions: QuizQuestion[];
  seed: string; // для ачивки «Серийный миллионер»: разные наборы = разные seed
};

function shuffle<T>(arr: readonly T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Детерминированный rand из seed, чтобы набор можно было воспроизвести
function seededRand(seed: string) {
  let h = 2166136261;
  for (const c of seed) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => {
    h += h << 13; h ^= h >>> 7; h += h << 3; h ^= h >>> 17; h += h << 5;
    return ((h >>> 0) / 4294967296);
  };
}

export function pickGameQuestions(
  all: readonly QuizQuestion[],
  opts: { seed?: string; excludeIds?: ReadonlySet<string>; onlyIds?: ReadonlySet<string> | null; target?: number },
): GameSet {
  const seed = opts.seed ?? String(Date.now());
  const rand = seededRand(seed);
  const target = opts.target ?? 15;
  let pool = all.filter((q) => !opts.excludeIds?.has(q.id));
  if (opts.onlyIds) pool = pool.filter((q) => opts.onlyIds!.has(q.id));
  if (pool.length < target && !opts.onlyIds) pool = [...all]; // для режима промахов не добавлять чужие вопросы

  const byDifficulty = (min: number, max: number) =>
    shuffle(pool.filter((q) => q.difficulty >= min && q.difficulty <= max), rand);

  const picked: QuizQuestion[] = [];
  const categoryCount = new Map<string, number>();
  const canTake = (q: QuizQuestion) => (categoryCount.get(q.category) ?? 0) < 3;

  const takeFrom = (list: QuizQuestion[], n: number) => {
    for (const q of list) {
      if (picked.length >= target) break;
      if (picked.some((p) => p.id === q.id)) continue;
      if (!canTake(q)) continue;
      picked.push(q);
      categoryCount.set(q.category, (categoryCount.get(q.category) ?? 0) + 1);
      if (picked.filter((p) => p.difficulty === q.difficulty).length >= n) break;
    }
  };

  // 5 лёгких, 5 средних, 5 сложных - по факту берём с учётом лимита категорий
  takeFrom(byDifficulty(1, 2), 5);
  takeFrom(byDifficulty(2, 3), 5);
  takeFrom(byDifficulty(3, 5), 5);
  // Добираем, если лимит категорий не дал 15
  if (picked.length < target) {
    for (const q of shuffle(pool, rand)) {
      if (picked.length >= target) break;
      if (!picked.some((p) => p.id === q.id)) picked.push(q);
    }
  }
  // Сортируем по сложности, чтобы лестница росла
  picked.sort((a, b) => a.difficulty - b.difficulty);
  return { questions: picked.slice(0, target), seed };
}

export const PRIZES = [
  100, 200, 300, 500, 1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 64_000, 125_000,
  250_000, 500_000, 1_000_000,
] as const;

export function getGuaranteedPrize(completedQuestions: number) {
  if (completedQuestions >= 10) return 32_000;
  if (completedQuestions >= 5) return 1_000;
  return 0;
}

// Консенсус Уолл-стрит: в 75% случаев толпа права, в 25% - ошибается.
// Именно это делает ачивку «Вопреки толпе» возможной.
export function getConsensusVotes(question: QuizQuestion, rand: () => number = Math.random) {
  const crowdIsRight = rand() > 0.25;
  const correctShare = crowdIsRight ? 52 + Math.floor(rand() * 28) : 18 + Math.floor(rand() * 18);
  const remaining = 100 - correctShare;
  const incorrect = [0, 1, 2, 3].filter((i) => i !== question.correctIndex);
  const votes = [0, 0, 0, 0];
  if (crowdIsRight) {
    votes[question.correctIndex] = correctShare;
  } else {
    // толпа ставит на случайный неверный ответ
    const crowdPick = incorrect[Math.floor(rand() * incorrect.length)];
    votes[crowdPick] = correctShare;
    votes[question.correctIndex] = Math.floor(remaining * 0.35);
    const rest = incorrect.filter((i) => i !== crowdPick);
    votes[rest[0]] = Math.floor(remaining * 0.35);
    votes[rest[1]] = remaining - votes[question.correctIndex] - votes[rest[0]];
    return { votes, crowdPick, crowdIsRight };
  }
  votes[incorrect[0]] = Math.floor(remaining * 0.4);
  votes[incorrect[1]] = Math.floor(remaining * 0.35);
  votes[incorrect[2]] = remaining - votes[incorrect[0]] - votes[incorrect[1]];
  return { votes, crowdPick: question.correctIndex, crowdIsRight };
}
