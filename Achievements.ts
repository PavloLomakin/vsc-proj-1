// Ачивки: ВСЕ накопительные.
// Принцип: каждая ачивка = счётчик + цель. Прогресс копится через все игры, не сгорает.
// Даже «одноразовые» (спидран, ночной снайпер) - это счётчик «сколько раз выполнено условие», цель = 1 или 3.
// Хранение - в AsyncStorage (см. lib/achievements.ts), здесь только данные.

import type { QuestionCategory, QuestionTag } from '@/data/questions';

export type AchievementGroup = 'ladder' | 'easter' | 'mastery' | 'lifelines' | 'milestones';

export type AchievementMetric =
  | { kind: 'gamesReached'; questionNumber: number } // дошёл до N-го вопроса в игре (1-based)
  | { kind: 'gamesReachedNoLifelines'; questionNumber: number }
  | { kind: 'millionWins' }
  | { kind: 'millionWinsNoLifelines' }
  | { kind: 'millionWinsFast'; maxMs: number }
  | { kind: 'millionWinsDistinctSets'; distinctSets: number } // серийный миллионер
  | { kind: 'failOnQuestion'; questionNumbers: number[] } // вылетел на указанных вопросах
  | { kind: 'fastAnswersThenFail'; firstN: number; maxMsPerAnswer: number; failOn: number }
  | { kind: 'mistakeReview'; questions: number } // переиграл N вопросов из Портфеля промахов
  | { kind: 'failSameQuestion'; times: number } // вылетел N раз на одном и том же вопросе
  | { kind: 'gamesOnWeekend' }
  | { kind: 'millionWinsAtNight'; fromHour: number; toHour: number }
  | { kind: 'correctInCategory'; category: QuestionCategory }
  | { kind: 'correctWithAnyTag'; tags: QuestionTag[] } // для Охотника: scam OR timing OR leverage
  | { kind: 'correctHard'; minDifficulty: number } // difficulty >= 4 = уровни 11-15
  | { kind: 'insiderOnLateQuestionAndWin'; fromQuestion: number } // инсайд на позднем вопросе + миллион
  | { kind: 'againstConsensusAndCorrect' } // правильный вопреки Консенсусу, когда он ошибся
  | { kind: 'stopLossSavedAndWin'; fromQuestion: number; toQuestion: number }
  | { kind: 'millionWinAllLifelinesSpentEarly'; beforeQuestion: number }
  | { kind: 'uniqueCorrect'; total: number }; // 100 / 500 / 1000 уникальных

export type Achievement = {
  id: string;
  title: string;
  description: string;
  group: AchievementGroup;
  metric: AchievementMetric;
  target: number; // сколько нужно накопить
};

export const ACHIEVEMENTS: readonly Achievement[] = [
  // 1. Покорение лестницы до миллиона
  { id: 'first-safe', title: 'Первая несгораемая', description: 'Дойти до первого несгораемого рубежа (5/15) в любой игре.', group: 'ladder', metric: { kind: 'gamesReached', questionNumber: 5 }, target: 1 },
  { id: 'confident-middle', title: 'Уверенный средний класс', description: 'Преодолеть второй несгораемый порог (10/15) без единой подсказки.', group: 'ladder', metric: { kind: 'gamesReachedNoLifelines', questionNumber: 10 }, target: 1 },
  { id: 'invest-millionaire', title: 'Инвест-миллионер!', description: 'Пройти всю лестницу из 15 вопросов и забрать миллион.', group: 'ladder', metric: { kind: 'millionWins' }, target: 1 },
  { id: 'white-gloves', title: 'Миллионер в белых перчатках', description: 'Выиграть миллион, ни разу не воспользовавшись подсказками.', group: 'ladder', metric: { kind: 'millionWinsNoLifelines' }, target: 1 },
  { id: 'speedrun', title: 'Спидран до миллиона', description: 'Пройти все 15 вопросов и забрать миллион меньше чем за 3 минуты.', group: 'ladder', metric: { kind: 'millionWinsFast', maxMs: 3 * 60 * 1000 }, target: 1 },
  { id: 'serial-millionaire', title: 'Серийный миллионер', description: 'Забрать главный приз (15/15) три раза на разных наборах вопросов.', group: 'ladder', metric: { kind: 'millionWinsDistinctSets', distinctSets: 3 }, target: 3 },

  // 2. Ироничные и смешные (пасхалки)
  { id: 'buy-high-sell-low', title: 'Покупаю на хаях, продаю на лоях', description: 'Вылететь на самом первом вопросе из 15.', group: 'easter', metric: { kind: 'failOnQuestion', questionNumbers: [1] }, target: 1 },
  { id: 'painful-miss', title: 'Обидный срыв на финишной прямой', description: 'Ошибиться на 14-м или 15-м вопросе, когда миллион был почти в кармане.', group: 'easter', metric: { kind: 'failOnQuestion', questionNumbers: [14, 15] }, target: 1 },
  { id: 'caffeine-trader', title: 'Трейдер на кофеине', description: 'Ответить на первые 5 вопросов быстрее 2 секунд на каждый и вылететь на 6-м.', group: 'easter', metric: { kind: 'fastAnswersThenFail', firstN: 5, maxMsPerAnswer: 2000, failOn: 6 }, target: 1 },
  { id: 'fixed-loss', title: 'Зафиксировал убыток', description: 'Зайти в «Портфель промахов» и переиграть 10 вопросов, на которых ранее вылетал.', group: 'easter', metric: { kind: 'mistakeReview', questions: 10 }, target: 10 },
  { id: 'averaged-to-zero', title: 'Усреднил до нуля', description: 'Трижды вылететь из игры на одном и том же вопросе.', group: 'easter', metric: { kind: 'failSameQuestion', times: 3 }, target: 1 },
  { id: 'weekend-investor', title: 'Инвестор выходного дня', description: 'Пойти за миллионом в субботу или воскресенье, когда биржи закрыты.', group: 'easter', metric: { kind: 'gamesOnWeekend' }, target: 1 },
  { id: 'night-sniper', title: 'Ночной снайпер на премаркете', description: 'Выиграть миллион с 01:00 до 05:00 утра.', group: 'easter', metric: { kind: 'millionWinsAtNight', fromHour: 1, toHour: 5 }, target: 1 },

  // 3. Мастерство в рубриках (накопительные)
  { id: 'accounting-detective', title: 'Бухгалтерский детектив', description: 'Верно ответить суммарно на 25 вопросов из рубрики «Анализ финансовой отчетности».', group: 'mastery', metric: { kind: 'correctInCategory', category: 'financials' }, target: 25 },
  { id: 'myth-buster', title: 'Разрушитель легенд', description: 'Верно ответить суммарно на 25 вопросов из рубрики «Популярные мифы».', group: 'mastery', metric: { kind: 'correctInCategory', category: 'myths' }, target: 25 },
  { id: 'wall-street-therapist', title: 'Психотерапевт с Уолл-стрит', description: 'Верно ответить на 20 вопросов из раздела «Психология без клише».', group: 'mastery', metric: { kind: 'correctInCategory', category: 'psychology' }, target: 20 },
  { id: 'scam-hunter', title: 'Охотник за инфоцыганами', description: 'Верно ответить на 20 вопросов о вреде тайминга, плеча и скама (теги scam / timing / leverage).', group: 'mastery', metric: { kind: 'correctWithAnyTag', tags: ['scam', 'timing', 'leverage'] }, target: 20 },
  { id: 'bridgewater-offer', title: 'Оффер в Bridgewater', description: 'Верно ответить на 15 вопросов из рубрики «Собеседование с легендами».', group: 'mastery', metric: { kind: 'correctInCategory', category: 'interview' }, target: 15 },
  { id: 'wall-street-professor', title: 'Профессор с Уолл-стрит', description: 'Правильно ответить на 15 сложных вопросов (уровень 11-15, difficulty 4-5).', group: 'mastery', metric: { kind: 'correctHard', minDifficulty: 4 }, target: 15 },

  // 4. Подсказки и спасения
  { id: 'late-insider', title: 'Инсайд на финишной прямой', description: 'Использовать «Инсайд от аналитика 50/50» на 13-15 вопросе и забрать миллион.', group: 'lifelines', metric: { kind: 'insiderOnLateQuestionAndWin', fromQuestion: 13 }, target: 1 },
  { id: 'against-crowd', title: 'Вопреки толпе', description: 'Выбрать правильный ответ вопреки «Консенсусу Уолл-стрит», когда аналитики ошиблись.', group: 'lifelines', metric: { kind: 'againstConsensusAndCorrect' }, target: 1 },
  { id: 'stop-loss-worked', title: 'Стоп-лосс сработал', description: 'Спастись от вылета благодаря «Стоп-лоссу» на 11-14 вопросе и дойти до миллиона.', group: 'lifelines', metric: { kind: 'stopLossSavedAndWin', fromQuestion: 11, toQuestion: 14 }, target: 1 },
  { id: 'margin-call-edge', title: 'На грани маржин-колла', description: 'Забрать миллион, использовав все три подсказки до 10-го вопроса.', group: 'lifelines', metric: { kind: 'millionWinAllLifelinesSpentEarly', beforeQuestion: 10 }, target: 1 },

  // 5. Масштабные вехи (база 985 вопросов, цель 1000 - с запасом под будущие вопросы)
  { id: 'first-ten', title: 'Первые десять', description: 'Накопить 10 уникальных верных ответов за все партии.', group: 'milestones', metric: { kind: 'uniqueCorrect', total: 10 }, target: 10 },
  { id: 'first-fifty', title: 'Первая пятёрка десятков', description: 'Накопить 50 уникальных верных ответов за все партии.', group: 'milestones', metric: { kind: 'uniqueCorrect', total: 50 }, target: 50 },
  { id: 'first-hundred', title: 'Первая сотня', description: 'Накопить 100 уникальных верных ответов за все партии и покинуть лигу Хомяков.', group: 'milestones', metric: { kind: 'uniqueCorrect', total: 100 }, target: 100 },
  { id: 'quarter-thousand', title: 'Четверть базы', description: 'Покорить 250 уникальных вопросов из базы.', group: 'milestones', metric: { kind: 'uniqueCorrect', total: 250 }, target: 250 },
  { id: 'equator', title: 'Экватор пройден', description: 'Покорить 500 уникальных вопросов из базы.', group: 'milestones', metric: { kind: 'uniqueCorrect', total: 500 }, target: 500 },
  { id: 'three-quarter-oracle', title: 'Три четверти знаний', description: 'Покорить 750 уникальных вопросов из базы.', group: 'milestones', metric: { kind: 'uniqueCorrect', total: 750 }, target: 750 },
  { id: 'absolute-oracle', title: 'Абсолютный Оракул', description: 'Закрыть всю базу (985 вопросов) без неисправленных промахов: все в Портфеле промахов отработаны.', group: 'milestones', metric: { kind: 'uniqueCorrect', total: 985 }, target: 985 },
];

export const ACHIEVEMENT_GROUPS: Record<AchievementGroup, string> = {
  ladder: 'Покорение лестницы до миллиона',
  easter: 'Ироничные и смешные (пасхалки)',
  mastery: 'Мастерство в рубриках',
  lifelines: 'Подсказки и спасения',
  milestones: 'Масштабные вехи',
};

export const ACHIEVEMENT_ICONS: Record<string, string> = {
  'first-safe': '🪜',
  'confident-middle': '🧭',
  'invest-millionaire': '💰',
  'white-gloves': '🧤',
  speedrun: '⚡',
  'serial-millionaire': '🔁',
  'buy-high-sell-low': '🐹',
  'painful-miss': '🏁',
  'caffeine-trader': '☕',
  'fixed-loss': '🩹',
  'averaged-to-zero': '📉',
  'weekend-investor': '📅',
  'night-sniper': '🌙',
  'accounting-detective': '🔍',
  'myth-buster': '🧹',
  'wall-street-therapist': '🧠',
  'scam-hunter': '🕵️',
  'bridgewater-offer': '🏛️',
  'wall-street-professor': '🎓',
  'late-insider': '📰',
  'against-crowd': '🗣️',
  'stop-loss-worked': '🛡️',
  'margin-call-edge': '🚨',
  'first-hundred': '💯',
  'first-ten': '🔟',
  'first-fifty': '5️⃣',
  'quarter-thousand': '¼',
  'three-quarter-oracle': '¾',
  equator: '🌐',
  'absolute-oracle': '🔮',
};
