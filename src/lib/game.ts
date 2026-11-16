import type { QuestionCategory, QuizQuestion } from '@/data/questions';

export type GameMode = 'millionaire' | 'radar' | 'mistakes';

export type RadarSkill = {
  id: 'psychology' | 'risk' | 'financials' | 'markets' | 'myths';
  label: string;
  categories: readonly QuestionCategory[];
};

export const RADAR_SKILLS: readonly RadarSkill[] = [
  { id: 'psychology', label: 'Психология', categories: ['psychology'] },
  { id: 'risk', label: 'Риск-менеджмент', categories: ['portfolio', 'bonds', 'derivatives', 'scam'] },
  { id: 'financials', label: 'Анализ отчетности', categories: ['financials'] },
  { id: 'markets', label: 'Рынки и инструменты', categories: ['markets', 'economics', 'stocks', 'taxes'] },
  { id: 'myths', label: 'Мифы и скам', categories: ['myths'] },
];

export type QuestionAttempt = {
  question: QuizQuestion;
  correct: boolean;
  responseMs: number;
};

export type GameQuestionSet = {
  questions: QuizQuestion[];
  seed: string;
};

function shuffle<T>(items: readonly T[], random: () => number) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function createRandom(seed: string) {
  let state = 0x811c9dc5;
  for (const character of seed) {
    state = Math.imul(state ^ character.charCodeAt(0), 0x01000193);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickQuestions(
  allQuestions: readonly QuizQuestion[],
  mode: GameMode,
  mistakeIds: readonly string[] = [],
): GameQuestionSet {
  const seed = `${Date.now()}-${Math.random()}`;
  const random = createRandom(seed);

  if (mode === 'mistakes') {
    const missed = new Set(mistakeIds);
    return {
      questions: shuffle(allQuestions.filter((question) => missed.has(question.id)), random).slice(0, 15),
      seed,
    };
  }

  if (mode === 'radar') {
    const questions: QuizQuestion[] = [];
    for (const skill of RADAR_SKILLS) {
      const pool = allQuestions.filter((question) => skill.categories.includes(question.category));
      questions.push(...shuffle(pool, random).slice(0, 6));
    }

    return {
      questions: shuffle(questions, random),
      seed,
    };
  }

  const selected: QuizQuestion[] = [];
  const addFrom = (pool: readonly QuizQuestion[], count: number) => {
    const initialLength = selected.length;
    for (const question of shuffle(pool, random)) {
      if (selected.length >= 15) break;
      if (!selected.some((picked) => picked.id === question.id)) selected.push(question);
      if (selected.length - initialLength >= count) break;
    }
  };

  addFrom(allQuestions.filter((question) => question.difficulty <= 2), 5);
  addFrom(allQuestions.filter((question) => question.difficulty >= 2 && question.difficulty <= 3), 5);
  addFrom(allQuestions.filter((question) => question.difficulty >= 3), 5);

  for (const question of shuffle(allQuestions, random)) {
    if (selected.length >= 15) break;
    if (!selected.some((picked) => picked.id === question.id)) selected.push(question);
  }

  selected.sort((left, right) => left.difficulty - right.difficulty);
  return { questions: selected.slice(0, 15), seed };
}

export function getConsensusVotes(question: QuizQuestion, random: () => number = Math.random) {
  const crowdIsRight = random() >= (question.difficulty >= 4 ? 0.45 : 0.25);
  const correctShare = crowdIsRight
    ? 55 + Math.floor(random() * 26)
    : 18 + Math.floor(random() * 18);
  const votes = [0, 0, 0, 0];
  const incorrect = [0, 1, 2, 3].filter((index) => index !== question.correctIndex);
  const remaining = 100 - correctShare;

  if (crowdIsRight) {
    votes[question.correctIndex] = correctShare;
    votes[incorrect[0]] = Math.floor(remaining * 0.4);
    votes[incorrect[1]] = Math.floor(remaining * 0.35);
    votes[incorrect[2]] = remaining - votes[incorrect[0]] - votes[incorrect[1]];
    return { votes, crowdPick: question.correctIndex, crowdIsRight };
  }

  const crowdPick = incorrect[Math.floor(random() * incorrect.length)];
  const otherIncorrect = incorrect.filter((index) => index !== crowdPick);
  votes[crowdPick] = correctShare;
  votes[question.correctIndex] = Math.floor(remaining * 0.35);
  votes[otherIncorrect[0]] = Math.floor(remaining * 0.35);
  votes[otherIncorrect[1]] = remaining - votes[question.correctIndex] - votes[otherIncorrect[0]];
  return { votes, crowdPick, crowdIsRight };
}

export function getRadarResults(attempts: readonly QuestionAttempt[]) {
  return RADAR_SKILLS.map((skill) => {
    const relevant = attempts.filter((attempt) => skill.categories.includes(attempt.question.category));
    const correct = relevant.filter((attempt) => attempt.correct).length;
    return {
      ...skill,
      correct,
      total: relevant.length,
      percentage: relevant.length > 0 ? Math.round((correct / relevant.length) * 100) : 0,
    };
  });
}
