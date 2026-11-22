import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Link } from 'expo-router';
import Svg, { Circle, Line, Polygon, Text as SvgText } from 'react-native-svg';

import {
  ACHIEVEMENT_ICONS,
  ACHIEVEMENTS,
  ACHIEVEMENT_GROUPS,
  type Achievement,
  type AchievementGroup,
} from '@/data/achievements';
import { CATEGORY_LABELS, QUESTIONS, type QuizQuestion } from '@/data/questions';
import {
  applyGameEvent,
  emptyStats,
  getProgress,
  getUnlockedAchievements,
  getGuestMigrationTarget,
  loadStats,
  saveStats,
  setGuestMigrationTarget,
  type GameEvent,
  type Stats,
} from '../../Achievements-Engine';
import {
  isFirebaseConfigured,
  loadCloudProgress,
  observeAccount,
  saveCloudProgress,
  signInWithGoogle,
  signOutFromGoogle,
  type CloudUser,
} from '@/lib/cloud-account';
import {
  getConsensusVotes,
  getRadarResults,
  pickQuestions,
  type GameMode,
  type QuestionAttempt,
} from '@/lib/game';
import { mergeStats, normalizeStats } from '@/lib/progress-sync';

const GOLD = '#f2c65d';
const MUTED = '#9baccb';
const PRIZES = [
  100, 200, 300, 500, 1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 64_000, 125_000,
  250_000, 500_000, 1_000_000,
] as const;

type Screen = 'home' | 'game' | 'result' | 'radar-result' | 'mistakes' | 'achievements';
type AnswerStatus = 'unanswered' | 'correct' | 'wrong' | 'saved';
type Lifeline = 'insider' | 'consensus' | 'stoploss';
type GameResult = {
  type: 'won' | 'lost' | 'walkaway';
  amount: number;
  correctAnswers: number;
};
type GameModal =
  | { type: 'consensus'; votes: number[]; crowdPick: number; crowdIsRight: boolean }
  | { type: 'cashout' }
  | { type: 'exit' }
  | { type: 'achievement'; achievement: Achievement }
  | null;
type ButtonVariant = 'primary' | 'secondary' | 'subtle';

function formatPrize(amount: number) {
  return `$${amount.toLocaleString('en-US')}`;
}

function getGuaranteedPrize(completedQuestions: number) {
  if (completedQuestions >= 10) return 32_000;
  if (completedQuestions >= 5) return 1_000;
  return 0;
}

const INVESTOR_RANKS = [
  { minimum: 0, title: 'Новичок рынка' },
  { minimum: 1, title: 'Начинающий инвестор' },
  { minimum: 4, title: 'Аналитик' },
  { minimum: 8, title: 'Портфельный стратег' },
  { minimum: 13, title: 'Эксперт рынка' },
  { minimum: 19, title: 'Легенда инвестиций' },
  { minimum: 26, title: 'Абсолютный оракул' },
] as const;

function getInvestorRank(unlockedCount: number) {
  let current: (typeof INVESTOR_RANKS)[number] = INVESTOR_RANKS[0];
  for (const rank of INVESTOR_RANKS) {
    if (rank.minimum > unlockedCount) break;
    current = rank;
  }

  const next = INVESTOR_RANKS.find((rank) => rank.minimum > unlockedCount);
  return {
    title: current.title,
    progress: next
      ? ((unlockedCount - current.minimum) / (next.minimum - current.minimum)) * 100
      : 100,
    nextTitle: next?.title ?? null,
    remaining: next ? next.minimum - unlockedCount : 0,
  };
}

const ANSWER_RANKS = [
  { minimum: 0, title: 'Новичок знаний' },
  { minimum: 10, title: 'Ученик рынка' },
  { minimum: 25, title: 'Опытный ответчик' },
  { minimum: 50, title: 'Аналитик практики' },
  { minimum: 100, title: 'Портфельный знаток' },
  { minimum: 250, title: 'Фундированный эксперт' },
  { minimum: 500, title: 'Стратег знаний' },
  { minimum: 1000, title: 'Магистр рынка' },
  { minimum: 2500, title: 'Абсолютный оракул знаний' },
] as const;

function getAnswerRank(correctAnswerCount: number) {
  let current: (typeof ANSWER_RANKS)[number] = ANSWER_RANKS[0];
  for (const rank of ANSWER_RANKS) {
    if (rank.minimum > correctAnswerCount) break;
    current = rank;
  }

  const next = ANSWER_RANKS.find((rank) => rank.minimum > correctAnswerCount);
  return {
    title: current.title,
    progress: next
      ? ((correctAnswerCount - current.minimum) / (next.minimum - current.minimum)) * 100
      : 100,
    nextTitle: next?.title ?? null,
    remaining: next ? next.minimum - correctAnswerCount : 0,
  };
}

function formatAchievementCount(count: number) {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;
  const noun =
    lastTwoDigits >= 11 && lastTwoDigits <= 14
      ? 'ачивок'
      : lastDigit === 1
        ? 'ачивка'
        : lastDigit >= 2 && lastDigit <= 4
          ? 'ачивки'
          : 'ачивок';
  return `${count} ${noun}`;
}

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  compact?: boolean;
};

function ActionButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  compact = false,
}: ActionButtonProps) {
  const variantStyle =
    variant === 'primary'
      ? styles.primaryButton
      : variant === 'secondary'
        ? styles.secondaryButton
        : styles.subtleButton;
  const textStyle = variant === 'primary' ? styles.primaryButtonText : styles.secondaryButtonText;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        compact && styles.actionButtonCompact,
        variantStyle,
        pressed && !disabled && styles.buttonPressed,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Text
        style={[
          textStyle,
          compact && (variant === 'primary' ? styles.primaryButtonTextCompact : styles.secondaryButtonTextCompact),
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

type LifelineButtonProps = {
  label: string;
  used: boolean;
  disabled: boolean;
  onPress: () => void;
};

function LifelineButton({ label, used, disabled, onPress }: LifelineButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.lifelineButton,
        used && styles.lifelineUsed,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      <Text style={[styles.lifelineText, used && styles.lifelineUsedText]}>
        {used ? `✓ ${label}` : label}
      </Text>
    </Pressable>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.brand, compact && styles.brandCompact]}>
      <Link href="https://pavlolomakin.github.io/Pavlo.Lomakin/" asChild>
        <Pressable
          accessibilityLabel="Открыть сайт Павла Ломакина"
          accessibilityRole="link"
          style={StyleSheet.flatten([
            styles.brandImageLink,
            compact && styles.brandImageLinkCompact,
          ])}
        >
          <Image
            source={require('@/assets/images/profile-icon.jpg')}
            resizeMode="cover"
            style={styles.brandImage}
          />
        </Pressable>
      </Link>
      <View style={styles.brandCopy}>
        <Text style={[styles.brandEyebrow, compact && styles.brandEyebrowCompact]}>
          Инвестиции с Павлом Ломакиным
        </Text>
        <Text style={[styles.brandName, compact && styles.brandNameCompact]}>ИНВЕСТ-М</Text>
      </View>
    </View>
  );
}

function PrizeLadder({ currentQuestion }: { currentQuestion: number }) {
  return (
    <View style={styles.ladderCard}>
      <Text style={styles.ladderTitle}>ЛЕСТНИЦА ПРИЗОВ</Text>
      {[...PRIZES].reverse().map((prize, displayIndex) => {
        const questionNumber = PRIZES.length - displayIndex;
        const isCurrent = questionNumber - 1 === currentQuestion;
        const isSafe = questionNumber === 5 || questionNumber === 10;

        return (
          <View
            key={questionNumber}
            style={[
              styles.ladderRow,
              isCurrent && styles.ladderRowCurrent,
              isSafe && styles.ladderRowSafe,
            ]}
          >
            <Text
              style={[
                styles.ladderNumber,
                isCurrent && styles.ladderTextCurrent,
                isSafe && styles.ladderTextSafe,
              ]}
            >
              {String(questionNumber).padStart(2, '0')}
            </Text>
            <Text
              style={[
                styles.ladderPrize,
                isCurrent && styles.ladderTextCurrent,
                isSafe && styles.ladderTextSafe,
              ]}
            >
              {formatPrize(prize)}
            </Text>
            {isSafe && <Text style={styles.safeLabel}>НЕСГОРАЕМАЯ</Text>}
          </View>
        );
      })}
      <Text style={styles.ladderNote}>Несгораемые суммы: $1,000 и $32,000</Text>
    </View>
  );
}

function RadarChart({ skills }: { skills: ReturnType<typeof getRadarResults> }) {
  const center = 150;
  const radius = 96;
  const pointFor = (index: number, value: number) => {
    const angle = (2 * Math.PI * index) / skills.length;
    return {
      x: center + Math.sin(angle) * radius * value,
      y: center - Math.cos(angle) * radius * value,
    };
  };
  const points = (value: number) =>
    skills
      .map((_, index) => {
        const point = pointFor(index, value);
        return `${point.x},${point.y}`;
      })
      .join(' ');

  return (
    <Svg height={300} viewBox="0 0 300 300" width="100%">
      {[0.25, 0.5, 0.75, 1].map((level) => (
        <Polygon
          key={level}
          points={points(level)}
          fill="none"
          stroke="#344969"
          strokeWidth={1}
        />
      ))}
      {skills.map((skill, index) => {
        const edge = pointFor(index, 1);
        return (
          <Line
            key={skill.id}
            x1={center}
            x2={edge.x}
            y1={center}
            y2={edge.y}
            stroke="#344969"
            strokeWidth={1}
          />
        );
      })}
      <Polygon
        points={skills
          .map((skill, index) => {
            const point = pointFor(index, skill.percentage / 100);
            return `${point.x},${point.y}`;
          })
          .join(' ')}
        fill="rgba(242, 198, 93, 0.24)"
        stroke={GOLD}
        strokeWidth={2}
      />
      {skills.map((skill, index) => {
        const point = pointFor(index, skill.percentage / 100);
        return <Circle key={skill.id} cx={point.x} cy={point.y} r={4} fill={GOLD} />;
      })}
      {[25, 50, 75, 100].map((level, index) => (
        <SvgText key={level} x={center + 4} y={center - radius * ((index + 1) / 4) + 4} fill={MUTED} fontSize={8}>
          {level}
        </SvgText>
      ))}
    </Svg>
  );
}

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 820;
  const isCompact = width <= 600;
  const [screen, setScreen] = useState<Screen>('home');
  const [gameMode, setGameMode] = useState<GameMode>('millionaire');
  const [gameQuestions, setGameQuestions] = useState<QuizQuestion[]>([]);
  const [gameSeed, setGameSeed] = useState('');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [answerStatus, setAnswerStatus] = useState<AnswerStatus>('unanswered');
  const [hiddenAnswers, setHiddenAnswers] = useState<number[]>([]);
  const [attempts, setAttempts] = useState<QuestionAttempt[]>([]);
  const [completedQuestionIds, setCompletedQuestionIds] = useState<Set<string>>(new Set());
  const [usedLifelines, setUsedLifelines] = useState<Record<Lifeline, boolean>>({
    insider: false,
    consensus: false,
    stoploss: false,
  });
  const [armedStopLoss, setArmedStopLoss] = useState(false);
  const [rollbackQuestion, setRollbackQuestion] = useState<number | null>(null);
  const [lifelineQuestionById, setLifelineQuestionById] = useState<
    Partial<Record<Lifeline, number>>
  >({});
  const [consensusForCurrentQuestion, setConsensusForCurrentQuestion] = useState<{
    crowdPick: number;
    crowdIsRight: boolean;
  } | null>(null);
  const [consensusWasWrong, setConsensusWasWrong] = useState(false);
  const [pickedAgainstConsensus, setPickedAgainstConsensus] = useState(false);
  const [stopLossSavedOnQuestion, setStopLossSavedOnQuestion] = useState<number | null>(null);
  const [failQuestionNumber, setFailQuestionNumber] = useState<number | null>(null);
  const [failedQuestionId, setFailedQuestionId] = useState<string | null>(null);
  const [gameStartedAt, setGameStartedAt] = useState(new Date());
  const questionStartedAt = useRef(0);
  const [gameModal, setGameModal] = useState<GameModal>(null);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [stats, setStats] = useState<Stats>(emptyStats);
  const statsRef = useRef(stats);
  const accountUidRef = useRef<string | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<CloudUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [cloudStatus, setCloudStatus] = useState<string | null>(null);
  const [newAchievements, setNewAchievements] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    let syncId = 0;

    async function loadForUser(user: CloudUser | null) {
      const currentSyncId = ++syncId;
      accountUidRef.current = user?.uid ?? null;
      setAuthUser(user);
      setAuthLoading(false);
      setAuthError(null);
      setStatsLoading(true);
      setStatsError(null);

      try {
        if (user === null) {
          const guestStats = await loadStats();
          if (!active || currentSyncId !== syncId) return;
          statsRef.current = guestStats;
          setStats(guestStats);
          setCloudStatus(
            isFirebaseConfigured ? 'Без входа прогресс хранится на этом устройстве.' : null,
          );
          setStatsLoading(false);
          return;
        }

        const [guestStats, accountStats, migrationTarget] = await Promise.all([
          loadStats(),
          loadStats(user.uid),
          getGuestMigrationTarget(),
        ]);
        if (!active || currentSyncId !== syncId) return;

        let remoteStats: unknown | null;
        try {
          remoteStats = await loadCloudProgress(user.uid);
        } catch (error) {
          console.error('Unable to load cloud game progress.', error);
          const canImportGuest = migrationTarget === null || migrationTarget === user.uid;
          const localStats = mergeStats(
            accountStats,
            canImportGuest ? guestStats : emptyStats(),
          );
          await saveStats(localStats, user.uid);
          if (!active || currentSyncId !== syncId) return;
          statsRef.current = localStats;
          setStats(localStats);
          setCloudStatus('Облако недоступно - прогресс пока сохранён на устройстве.');
          setAuthError('Не удалось загрузить облачный прогресс. Проверьте подключение и настройки Firebase.');
          setStatsLoading(false);
          return;
        }

        const canImportGuest = migrationTarget === null || migrationTarget === user.uid;
        const syncedStats = mergeStats(
          accountStats,
          normalizeStats(remoteStats),
          canImportGuest ? guestStats : emptyStats(),
        );
        await saveStats(syncedStats, user.uid);
        if (migrationTarget === null && canImportGuest) {
          await setGuestMigrationTarget(user.uid);
        }
        if (!active || currentSyncId !== syncId) return;
        statsRef.current = syncedStats;
        setStats(syncedStats);
        setStatsLoading(false);

        try {
          await saveCloudProgress(user.uid, syncedStats);
          if (active && currentSyncId === syncId) {
            setCloudStatus('Прогресс синхронизирован с Google-аккаунтом.');
          }
        } catch (error) {
          console.error('Unable to save cloud game progress.', error);
          if (active && currentSyncId === syncId) {
            setCloudStatus('Облако недоступно - прогресс пока сохранён на устройстве.');
            setAuthError('Не удалось синхронизировать прогресс. Проверьте подключение и правила Firestore.');
          }
        }
      } catch (error) {
        console.error('Unable to load saved game progress.', error);
        if (!active || currentSyncId !== syncId) return;
        setStatsError('Не удалось загрузить сохранённый прогресс. Проверьте хранилище и перезапустите приложение.');
        setStatsLoading(false);
      }
    }

    const unsubscribe = observeAccount((user) => {
      void loadForUser(user);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  async function handleGoogleSignIn() {
    setAuthBusy(true);
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('Unable to sign in with Google.', error);
      setAuthError('Не удалось войти через Google. Попробуйте ещё раз.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleGoogleSignOut() {
    setAuthBusy(true);
    setAuthError(null);
    try {
      await signOutFromGoogle();
    } catch (error) {
      console.error('Unable to sign out from Google.', error);
      setAuthError('Не удалось выйти из Google-аккаунта.');
    } finally {
      setAuthBusy(false);
    }
  }

  const question = gameQuestions[questionIndex];
  const remainingQuestionCount = authUser === null
    ? QUESTIONS.length
    : QUESTIONS.filter((candidate) => !stats.uniqueCorrectIds.includes(candidate.id)).length;
  const radarResults = getRadarResults(attempts);
  const newAchievementTitles = newAchievements
    .map((id) => ACHIEVEMENTS.find((achievement) => achievement.id === id)?.title)
    .filter((title): title is string => title !== undefined);
  const allMistakeQuestions = QUESTIONS.filter((candidate) =>
    stats.mistakeIds.includes(candidate.id),
  );
  const mistakeQuestions = allMistakeQuestions.slice(0, 30);
  const unlockedAchievements = getUnlockedAchievements(stats);
  const investorRank = getInvestorRank(unlockedAchievements.length);
  const answerRank = getAnswerRank(stats.totalCorrectAnswers);

  function resetRoundState(mode: GameMode, questions: QuizQuestion[], seed: string) {
    setGameMode(mode);
    setGameQuestions(questions);
    setGameSeed(seed);
    setQuestionIndex(0);
    setSelectedAnswer(null);
    setAnswerStatus('unanswered');
    setHiddenAnswers([]);
    setAttempts([]);
    setCompletedQuestionIds(new Set());
    setUsedLifelines({ insider: false, consensus: false, stoploss: false });
    setArmedStopLoss(false);
    setRollbackQuestion(null);
    setLifelineQuestionById({});
    setConsensusForCurrentQuestion(null);
    setConsensusWasWrong(false);
    setPickedAgainstConsensus(false);
    setStopLossSavedOnQuestion(null);
    setFailQuestionNumber(null);
    setFailedQuestionId(null);
    setGameStartedAt(new Date());
    questionStartedAt.current = Date.now();
    setGameModal(null);
    setGameResult(null);
    setScreen('game');
  }

  function startGame(mode: GameMode = 'millionaire') {
    if (mode === 'mistakes' && statsRef.current.mistakeIds.length === 0) return;
    const excludedIds = accountUidRef.current === null ? [] : statsRef.current.uniqueCorrectIds;
    const { questions, seed } = pickQuestions(
      QUESTIONS,
      mode,
      statsRef.current.mistakeIds,
      excludedIds,
    );
    if (questions.length === 0) {
      setScreen('home');
      return;
    }
    resetRoundState(mode, questions, seed);
  }

  function saveRound(result: GameEvent['result'], finalScreen: Screen) {
    const event: GameEvent = {
      questionIds: attempts.map((attempt) => attempt.question.id),
      questions: attempts.map((attempt) => attempt.question),
      correctIndices: attempts.map((attempt) => attempt.correct),
      gameMode,
      usedLifelines: (Object.keys(usedLifelines) as Lifeline[]).filter(
        (lifeline) => usedLifelines[lifeline],
      ),
      lifelineQuestionById,
      consensusWasWrong,
      pickedAgainstConsensus,
      stopLossSavedOnQuestion,
      durationMs: Date.now() - gameStartedAt.getTime(),
      answerMsPerQuestion: attempts.map((attempt) => attempt.responseMs),
      startedAt: gameStartedAt,
      finishedAt: new Date(),
      result,
      correctCount: completedQuestionIds.size,
      failQuestionNumber,
      failedQuestionId,
      mistakeReviewCount:
        gameMode === 'mistakes' ? attempts.filter((attempt) => attempt.correct).length : 0,
    };
    const update = applyGameEvent(statsRef.current, event, gameSeed);
    statsRef.current = update.stats;
    setStats(update.stats);
    setNewAchievements(update.newlyUnlocked.map((achievement) => achievement.id));
    setGameModal(null);
    setScreen(finalScreen);

    const userId = accountUidRef.current ?? undefined;
    saveStats(update.stats, userId).catch((error: unknown) => {
      console.error('Unable to save game progress.', error);
      setStatsError('Не удалось сохранить прогресс. Проверьте свободное место на устройстве.');
    });
    if (userId !== undefined) {
      saveCloudProgress(userId, update.stats)
        .then(() => setCloudStatus('Прогресс синхронизирован с Google-аккаунтом.'))
        .catch((error: unknown) => {
          console.error('Unable to save cloud game progress.', error);
          setCloudStatus('Облако недоступно - прогресс пока сохранён на устройстве.');
          setAuthError('Партия сохранена на устройстве, но облачная синхронизация не удалась.');
        });
    }
  }

  function finishGame(result: GameResult) {
    setGameResult(result);
    const finalScreen = gameMode === 'radar' ? 'radar-result' : 'result';
    const eventResult: GameEvent['result'] =
      gameMode === 'millionaire' && result.type === 'won' ? 'won' : result.type;
    saveRound(eventResult, finalScreen);
  }

  function checkAnswer() {
    if (selectedAnswer === null || answerStatus !== 'unanswered' || !question) return;
    const correct = selectedAnswer === question.correctIndex;
    const responseMs = Date.now() - questionStartedAt.current;
    setAttempts((current) => [...current, { question, correct, responseMs }]);

    if (correct) {
      setCompletedQuestionIds((current) => new Set(current).add(question.id));
      if (
        consensusForCurrentQuestion !== null &&
        !consensusForCurrentQuestion.crowdIsRight &&
        selectedAnswer !== consensusForCurrentQuestion.crowdPick
      ) {
        setPickedAgainstConsensus(true);
      }
      setAnswerStatus('correct');
      return;
    }

    if (gameMode === 'millionaire' && armedStopLoss) {
      setArmedStopLoss(false);
      setStopLossSavedOnQuestion((current) => current ?? questionIndex + 1);
      setAnswerStatus('saved');
      return;
    }

    if (gameMode === 'millionaire') {
      setFailQuestionNumber(questionIndex + 1);
      setFailedQuestionId(question.id);
    }
    setAnswerStatus('wrong');
  }

  function advanceGame() {
    if (answerStatus === 'saved') {
      if (questionIndex > 0) {
        const priorQuestion = gameQuestions[questionIndex - 1];
        setCompletedQuestionIds((current) => {
          const updated = new Set(current);
          updated.delete(priorQuestion.id);
          return updated;
        });
        setRollbackQuestion(questionIndex);
        setQuestionIndex((current) => current - 1);
      }
      setSelectedAnswer(null);
      setAnswerStatus('unanswered');
      setHiddenAnswers([]);
      setConsensusForCurrentQuestion(null);
      questionStartedAt.current = Date.now();
      return;
    }

    if (answerStatus === 'correct' || answerStatus === 'wrong') {
      if (answerStatus === 'wrong' && gameMode === 'millionaire') {
        finishGame({
          type: 'lost',
          amount: getGuaranteedPrize(completedQuestionIds.size),
          correctAnswers: completedQuestionIds.size,
        });
        return;
      }

      let nextIndex = questionIndex + 1;
      if (
        answerStatus === 'correct' &&
        rollbackQuestion !== null &&
        questionIndex < rollbackQuestion
      ) {
        nextIndex = rollbackQuestion;
        setRollbackQuestion(null);
      }

      if (nextIndex >= gameQuestions.length) {
        const completedQuestions = completedQuestionIds.size;
        const completedFullRound = gameMode === 'millionaire' && gameQuestions.length === PRIZES.length;
        finishGame({
          type: completedFullRound ? 'won' : 'walkaway',
          amount: completedFullRound
            ? PRIZES[PRIZES.length - 1]
            : completedQuestions > 0
              ? PRIZES[completedQuestions - 1]
              : 0,
          correctAnswers: completedQuestions,
        });
        return;
      }

      setQuestionIndex(nextIndex);
      setSelectedAnswer(null);
      setAnswerStatus('unanswered');
      setHiddenAnswers([]);
      setConsensusForCurrentQuestion(null);
      questionStartedAt.current = Date.now();
      return;
    }
  }

  function takeMoney() {
    if (gameMode !== 'millionaire' || answerStatus === 'wrong') return;
    setGameModal({ type: 'cashout' });
  }

  function confirmCashout() {
    if (answerStatus === 'wrong') return;
    const completedQuestions = completedQuestionIds.size;
    const amount = completedQuestions === 0 ? 0 : PRIZES[completedQuestions - 1];
    setGameModal(null);
    finishGame({ type: 'walkaway', amount, correctAnswers: completedQuestions });
  }

  function useInsider() {
    if (usedLifelines.insider || answerStatus !== 'unanswered' || !question) return;

    const incorrectOptions = question.options
      .map((_, index) => index)
      .filter((index) => index !== question.correctIndex)
      .sort(() => Math.random() - 0.5);
    setHiddenAnswers(incorrectOptions.slice(0, 2));
    setUsedLifelines((current) => ({ ...current, insider: true }));
    setLifelineQuestionById((current) => ({ ...current, insider: questionIndex + 1 }));
  }

  function askConsensus() {
    if (usedLifelines.consensus || answerStatus !== 'unanswered' || !question) return;
    const consensus = getConsensusVotes(question);
    setConsensusWasWrong((current) => current || !consensus.crowdIsRight);
    setConsensusForCurrentQuestion({
      crowdPick: consensus.crowdPick,
      crowdIsRight: consensus.crowdIsRight,
    });
    setUsedLifelines((current) => ({ ...current, consensus: true }));
    setLifelineQuestionById((current) => ({ ...current, consensus: questionIndex + 1 }));
    setGameModal({ type: 'consensus', ...consensus });
  }

  function toggleStopLoss() {
    if (answerStatus !== 'unanswered' || armedStopLoss || !question) return;
    setArmedStopLoss(true);
    setUsedLifelines((current) => ({ ...current, stoploss: true }));
    setLifelineQuestionById((current) => ({ ...current, stoploss: questionIndex + 1 }));
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.appBackground}>
        <ScrollView
          contentContainerStyle={[
            styles.page,
            screen === 'home' && styles.homePage,
            screen === 'home' && isCompact && styles.homePageCompact,
            screen === 'game' && isCompact && styles.gamePageCompact,
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {screen === 'home' && (
            <View style={[styles.homeCard, isCompact && styles.homeCardCompact]}>
              <BrandMark compact={isCompact} />
              <View style={[styles.goldDivider, isCompact && styles.goldDividerCompact]} />
              <Text style={[styles.homeTitle, isCompact && styles.homeTitleCompact]}>
                Кто хочет стать
              </Text>
              <Text style={[styles.homeTitleGold, isCompact && styles.homeTitleGoldCompact]}>
                инвест-миллионером?
              </Text>
              <Text style={[styles.homeDescription, isCompact && styles.homeDescriptionCompact]}>
                Проверь свои инвест-знания, готов ли ты разогнать свой портфель до $1 млн. или не
                сможешь дойти и до $1000 ?!
              </Text>
              <View style={[styles.accountCard, isCompact && styles.accountCardCompact]}>
                <View style={styles.accountCopy}>
                  <Text style={styles.accountEyebrow}>СОХРАНЕНИЕ ПРОГРЕССА</Text>
                  <Text style={styles.accountDescription}>
                    {authUser?.email ??
                      (isFirebaseConfigured
                        ? 'Войдите через Google, чтобы синхронизировать прогресс.'
                        : 'Сейчас прогресс сохраняется на этом устройстве. Google-вход появится после настройки Firebase.')}
                  </Text>
                  {cloudStatus !== null && (
                    <Text style={styles.cloudStatus}>{cloudStatus}</Text>
                  )}
                  {authError !== null && <Text style={styles.errorMessage}>{authError}</Text>}
                </View>
                <ActionButton
                  label={
                    authBusy
                      ? 'Подождите…'
                      : authUser === null
                        ? 'Продолжить с Google'
                        : 'Выйти из аккаунта'
                  }
                  onPress={() => {
                    if (authUser === null) {
                      void handleGoogleSignIn();
                    } else {
                      void handleGoogleSignOut();
                    }
                  }}
                  disabled={!isFirebaseConfigured || authLoading || authBusy}
                  variant="secondary"
                  compact={isCompact}
                />
              </View>
              <View style={[styles.investorRankCard, isCompact && styles.investorRankCardCompact]}>
                <View style={styles.investorRankHeading}>
                  <View style={styles.investorRankCopy}>
                    <Text style={styles.investorRankEyebrow}>РЕЙТИНГ ИНВЕСТОРА</Text>
                    <Text style={styles.investorRankTitle}>{investorRank.title}</Text>
                  </View>
                  <Text style={styles.investorRankScore}>
                    {unlockedAchievements.length}/{ACHIEVEMENTS.length}
                  </Text>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${investorRank.progress}%` }]} />
                </View>
                <Text style={styles.investorRankNext}>
                  {investorRank.nextTitle === null
                    ? 'Высшее звание получено'
                    : `До звания «${investorRank.nextTitle}» - ещё ${formatAchievementCount(investorRank.remaining)}.`}
                </Text>
              </View>
              <View style={[styles.investorRankCard, isCompact && styles.investorRankCardCompact]}>
                <View style={styles.investorRankHeading}>
                  <View style={styles.investorRankCopy}>
                    <Text style={styles.investorRankEyebrow}>РЕЙТИНГ ПО ПРАВИЛЬНЫМ ОТВЕТАМ</Text>
                    <Text style={styles.investorRankTitle}>{answerRank.title}</Text>
                  </View>
                  <Text style={styles.investorRankScore}>
                    {stats.totalCorrectAnswers}
                  </Text>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${answerRank.progress}%` }]} />
                </View>
                <Text style={styles.investorRankNext}>
                  {answerRank.nextTitle === null
                    ? 'Максимальный разряд получен'
                    : `До звания «${answerRank.nextTitle}» - ещё ${answerRank.remaining} верн. ответов.`}
                </Text>
              </View>
              {statsLoading && <ActivityIndicator color={GOLD} />}
              {statsError !== null && <Text style={styles.errorMessage}>{statsError}</Text>}
              {authUser !== null && remainingQuestionCount === 0 && (
                <Text style={styles.emptyState}>
                  Ты уже ответил правильно на все вопросы. Новых вопросов для игры пока нет.
                </Text>
              )}
              <View style={[styles.homeActions, isCompact && styles.homeActionsCompact]}>
                <ActionButton
                  label="Начать игру"
                  disabled={
                    statsLoading ||
                    authLoading ||
                    statsError !== null ||
                    (authUser !== null && remainingQuestionCount === 0)
                  }
                  onPress={() => startGame('millionaire')}
                  compact={isCompact}
                />
                <ActionButton
                  label="Радар инвестора · до 30 вопросов"
                  disabled={
                    statsLoading ||
                    authLoading ||
                    statsError !== null ||
                    (authUser !== null && remainingQuestionCount === 0)
                  }
                  onPress={() => startGame('radar')}
                  variant="secondary"
                  compact={isCompact}
                />
                <ActionButton
                  label={`Ачивки · ${getUnlockedAchievements(stats).length}/${ACHIEVEMENTS.length}`}
                  disabled={statsLoading || authLoading || statsError !== null}
                  onPress={() => setScreen('achievements')}
                  variant="secondary"
                  compact={isCompact}
                />
                <ActionButton
                  label={`Убыточные позиции · ${stats.mistakeIds.length}`}
                  disabled={statsLoading || authLoading || statsError !== null || stats.mistakeIds.length === 0}
                  onPress={() => setScreen('mistakes')}
                  variant="secondary"
                  compact={isCompact}
                />
              </View>
              <Text style={[styles.disclaimer, isCompact && styles.disclaimerCompact]}>
                Игра носит образовательный характер и не является инвестиционной рекомендацией.
              </Text>
            </View>
          )}

          {screen === 'game' && question && (
            <View style={styles.gameScreen}>
            <View style={[styles.gameHeader, isCompact && styles.gameHeaderCompact]}>
              <BrandMark compact={isCompact} />
              <View style={[styles.questionCount, isCompact && styles.questionCountCompact]}>
                  <Text style={styles.questionCountText}>
                    {gameMode === 'millionaire'
                      ? 'ИНВЕСТ-М'
                      : gameMode === 'radar'
                        ? 'РАДАР'
                        : 'РАБОТА НАД ОШИБКАМИ'}{' '}
                    · {questionIndex + 1} / {gameQuestions.length}
                  </Text>
                </View>
              </View>
              <View style={[styles.gameActions, isCompact && styles.gameActionsCompact]}>
                <ActionButton
                  label="На главный экран"
                  onPress={() => setGameModal({ type: 'exit' })}
                  variant="subtle"
                  compact={isCompact}
                />
              </View>

              <View style={[styles.lifelinesCard, isCompact && styles.lifelinesCardCompact]}>
                <Text style={[styles.lifelinesHeading, isCompact && styles.lifelinesHeadingCompact]}>
                  ПОДСКАЗКИ
                </Text>
                <View style={styles.lifelines}>
                  <LifelineButton
                    label="Инсайд от аналитика 50/50"
                    used={usedLifelines.insider}
                    disabled={usedLifelines.insider || answerStatus !== 'unanswered'}
                    onPress={useInsider}
                  />
                  <LifelineButton
                    label="Консенсус Уолл-стрит"
                    used={usedLifelines.consensus}
                    disabled={usedLifelines.consensus || answerStatus !== 'unanswered'}
                    onPress={askConsensus}
                  />
                  <LifelineButton
                    label={armedStopLoss ? 'Стоп-лосс · активен' : 'Стоп-лосс'}
                    used={usedLifelines.stoploss}
                    disabled={
                      gameMode !== 'millionaire' ||
                      usedLifelines.stoploss ||
                      answerStatus !== 'unanswered'
                    }
                    onPress={toggleStopLoss}
                  />
                </View>
                {armedStopLoss && (
                  <Text style={styles.stopLossNote}>Право на одну ошибку вооружено.</Text>
                )}
              </View>

              <View
                style={[
                  styles.gameLayout,
                  isWide && styles.gameLayoutWide,
                  isCompact && styles.gameLayoutCompact,
                ]}
              >
              <View style={[styles.questionColumn, isCompact && styles.questionColumnCompact]}>
                <View style={[styles.questionCard, isCompact && styles.questionCardCompact]}>
                  <Text style={styles.questionEyebrow}>ВОПРОС {String(questionIndex + 1).padStart(2, '0')}</Text>
                  <Text style={[styles.questionTitle, isCompact && styles.questionTitleCompact]}>
                    {question.question}
                  </Text>

                  <View style={[styles.answers, isWide && styles.answersWide, isCompact && styles.answersCompact]}>
                      {question.options.map((option, index) => {
                        if (hiddenAnswers.includes(index)) return null;

                        const isSelected = selectedAnswer === index;
                        const isCorrect = answerStatus !== 'unanswered' && index === question.correctIndex;
                        const isWrongSelection =
                          (answerStatus === 'wrong' || answerStatus === 'saved') && isSelected;

                        return (
                          <Pressable
                            key={option}
                            accessibilityRole="button"
                            accessibilityState={{
                              selected: isSelected,
                              disabled: answerStatus !== 'unanswered',
                            }}
                            disabled={answerStatus !== 'unanswered'}
                            onPress={() => setSelectedAnswer(index)}
                            style={({ pressed }) => [
                              styles.answerOption,
                              isWide && styles.answerOptionWide,
                              isCompact && styles.answerOptionCompact,
                              isSelected && answerStatus === 'unanswered' && styles.answerSelected,
                              isCorrect && styles.answerCorrect,
                              isWrongSelection && styles.answerWrong,
                              pressed && answerStatus === 'unanswered' && styles.answerPressed,
                            ]}
                          >
                            <Text
                              style={[
                                styles.answerLetter,
                                isCorrect && styles.answerLetterCorrect,
                                isWrongSelection && styles.answerLetterWrong,
                              ]}
                            >
                              {String.fromCharCode(65 + index)}
                            </Text>
                            <Text style={[styles.answerText, isCompact && styles.answerTextCompact]}>
                              {option}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    {answerStatus !== 'unanswered' && (
                      <View
                        style={[
                          styles.feedbackCard,
                          answerStatus === 'correct'
                            ? styles.feedbackCorrect
                            : answerStatus === 'saved'
                              ? styles.feedbackSaved
                              : styles.feedbackWrong,
                        ]}
                      >
                        <Text
                          style={[
                            styles.feedbackTitle,
                            answerStatus === 'correct'
                              ? styles.feedbackTitleCorrect
                              : answerStatus === 'saved'
                                ? styles.feedbackTitleSaved
                                : styles.feedbackTitleWrong,
                          ]}
                        >
                          {answerStatus === 'correct'
                            ? gameMode === 'millionaire'
                              ? `Верно! Текущий приз - ${formatPrize(PRIZES[completedQuestionIds.size - 1])}`
                              : 'Верно! Эта позиция закрыта.'
                            : answerStatus === 'saved'
                              ? 'Стоп-лосс сработал: ты не вылетаешь, но откатываешься на один шаг.'
                              : `Неверно. Правильный ответ - ${String.fromCharCode(65 + question.correctIndex)}`}
                        </Text>
                        <Text style={styles.feedbackText}>{question.explanation}</Text>
                      </View>
                    )}
                  </View>

                  <View style={[styles.gameActions, isCompact && styles.gameActionsCompact]}>
                    {answerStatus === 'unanswered' ? (
                      <ActionButton
                        label="Подтвердить ответ"
                        disabled={selectedAnswer === null}
                        onPress={checkAnswer}
                        compact={isCompact}
                      />
                    ) : (
                      <ActionButton
                        label={
                          answerStatus === 'saved'
                            ? questionIndex > 0
                              ? 'Стоп-лосс: откатиться на шаг'
                              : 'Попробовать ещё раз'
                            : answerStatus === 'wrong' && gameMode === 'millionaire'
                              ? 'Посмотреть итог'
                              : questionIndex === gameQuestions.length - 1
                                ? gameMode === 'millionaire'
                                  ? 'К финалу'
                                  : 'Завершить раунд'
                                : 'Следующий вопрос'
                        }
                        onPress={advanceGame}
                        compact={isCompact}
                      />
                    )}
                    {gameMode === 'millionaire' && (
                      <ActionButton
                        label={`Забрать деньги · ${formatPrize(
                          completedQuestionIds.size > 0
                            ? PRIZES[completedQuestionIds.size - 1]
                            : 0,
                        )}`}
                        onPress={takeMoney}
                        variant="secondary"
                        disabled={answerStatus === 'wrong'}
                        compact={isCompact}
                      />
                    )}
                  </View>
                </View>

                <View style={[styles.ladderColumn, isWide && styles.ladderColumnWide]}>
                  {gameMode === 'millionaire' ? (
                    <PrizeLadder currentQuestion={questionIndex} />
                  ) : (
                    <View style={styles.ladderCard}>
                      <Text style={styles.ladderTitle}>
                        {gameMode === 'radar' ? 'ПРОФИЛЬ НАВЫКОВ' : 'ПОРТФЕЛЬ ПРОМАХОВ'}
                      </Text>
                      <Text style={styles.feedbackText}>
                        {gameMode === 'radar'
                          ? `Ответь на ${gameQuestions.length} вопросов из пяти тематических направлений - и увидишь радар своих сильных сторон.`
                          : `В этой сессии: ${gameQuestions.length} позиций. Верный ответ уберёт вопрос из списка убытков.`}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          )}

          {screen === 'mistakes' && (
            <View style={styles.contentCard}>
              <BrandMark />
              <Text style={styles.sectionTitle}>Убыточные позиции</Text>
              <Text style={styles.rulesIntro}>
                Здесь хранятся вопросы с ошибками. Ответь на них правильно, чтобы закрыть убыток.
              </Text>
              {mistakeQuestions.length === 0 ? (
                <Text style={styles.emptyState}>Портфель чист - пока нет незакрытых промахов.</Text>
              ) : (
                <>
                  {allMistakeQuestions.length > mistakeQuestions.length && (
                    <Text style={styles.skillAttempts}>
                      Показаны первые {mistakeQuestions.length} из {allMistakeQuestions.length}.
                      За одну сессию можно закрыть до 15 позиций.
                    </Text>
                  )}
                  <View style={styles.mistakeList}>
                  {mistakeQuestions.map((missedQuestion) => (
                    <View key={missedQuestion.id} style={styles.mistakeRow}>
                      <Text style={styles.mistakeCategory}>
                        {CATEGORY_LABELS[missedQuestion.category]}
                      </Text>
                      <Text style={styles.mistakeQuestion} numberOfLines={3}>
                        {missedQuestion.question}
                      </Text>
                    </View>
                  ))}
                  </View>
                </>
              )}
              <View style={styles.resultActions}>
                <ActionButton
                  label={`Отработать позиции · ${Math.min(allMistakeQuestions.length, 15)}`}
                  disabled={allMistakeQuestions.length === 0}
                  onPress={() => startGame('mistakes')}
                />
                <ActionButton
                  label="На главный экран"
                  onPress={() => setScreen('home')}
                  variant="secondary"
                />
              </View>
            </View>
          )}

          {screen === 'achievements' && (
            <View style={styles.contentCard}>
              <BrandMark />
              <Text style={styles.sectionTitle}>Ачивки</Text>
              <Text style={styles.rulesIntro}>
                Разблокировано {getUnlockedAchievements(stats).length} из {ACHIEVEMENTS.length}.
                Прогресс сохраняется на этом устройстве.
              </Text>
              <View style={styles.unlockedBadgesSection}>
                <Text style={styles.achievementGroupTitle}>ПОЛУЧЕННЫЕ ЗНАЧКИ</Text>
                {unlockedAchievements.length === 0 ? (
                  <Text style={styles.emptyState}>Пока нет значков. Начни игру и получи первый!</Text>
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.unlockedBadges}
                  >
                    {unlockedAchievements.map((achievement) => (
                      <Pressable
                        key={achievement.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Значок «${achievement.title}». Открыть описание`}
                        onPress={() =>
                          setGameModal({ type: 'achievement', achievement })
                        }
                        style={({ pressed }) => [
                          styles.achievementBadge,
                          pressed && styles.buttonPressed,
                        ]}
                      >
                        <Text style={styles.achievementBadgeIcon}>
                          {ACHIEVEMENT_ICONS[achievement.id]}
                        </Text>
                        <Text numberOfLines={2} style={styles.achievementBadgeTitle}>
                          {achievement.title}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
              </View>
              {(
                Object.keys(ACHIEVEMENT_GROUPS) as AchievementGroup[]
              ).map((group) => (
                <View key={group} style={styles.achievementGroup}>
                  <Text style={styles.achievementGroupTitle}>{ACHIEVEMENT_GROUPS[group]}</Text>
                  {ACHIEVEMENTS.filter((achievement) => achievement.group === group).map(
                    (achievement) => {
                      const progress = Math.min(getProgress(stats, achievement), achievement.target);
                      const unlockedAt = stats.unlocked[achievement.id];
                      return (
                        <View
                          key={achievement.id}
                          style={[
                            styles.achievementRow,
                            unlockedAt !== undefined && styles.achievementUnlocked,
                          ]}
                        >
                          <View style={styles.achievementHeading}>
                            <Text style={styles.achievementTitle}>
                              {unlockedAt ? '✦ ' : '◇ '}
                              {achievement.title}
                            </Text>
                            <Text style={styles.achievementProgress}>
                              {progress}/{achievement.target}
                            </Text>
                          </View>
                          <Text style={styles.achievementDescription}>
                            {achievement.description}
                          </Text>
                          <View style={styles.progressTrack}>
                            <View
                              style={[
                                styles.progressFill,
                                { width: `${(progress / achievement.target) * 100}%` },
                              ]}
                            />
                          </View>
                        </View>
                      );
                    },
                  )}
                </View>
              ))}
              <ActionButton
                label="На главный экран"
                onPress={() => setScreen('home')}
                variant="secondary"
              />
            </View>
          )}

          {screen === 'radar-result' && (
            <View style={styles.resultCard}>
              <BrandMark />
              <Text style={styles.sectionTitle}>Радар инвестора</Text>
              <Text style={styles.resultDescription}>
                Профиль по итогам {attempts.length} вопросов. Результат показывает долю верных ответов в каждой
                теме, а не инвестиционную рекомендацию.
              </Text>
              <View style={styles.radarChartCard}>
                <RadarChart skills={radarResults} />
              </View>
              <View style={styles.skillList}>
                {radarResults.map((skill) => (
                  <View key={skill.id} style={styles.skillRow}>
                    <View style={styles.skillLabelLine}>
                      <Text style={styles.skillLabel}>{skill.label}</Text>
                      <Text style={styles.skillPercentage}>{skill.percentage}%</Text>
                    </View>
                    <View style={styles.progressTrack}>
                      <View
                        style={[styles.progressFill, { width: `${skill.percentage}%` }]}
                      />
                    </View>
                    <Text style={styles.skillAttempts}>
                      {skill.correct} верно из {skill.total}
                    </Text>
                  </View>
                ))}
              </View>
              {newAchievementTitles.length > 0 && (
                <View style={styles.unlockedNotice}>
                  <Text style={styles.unlockedTitle}>Новые ачивки</Text>
                  {newAchievementTitles.map((title) => (
                    <Text key={title} style={styles.unlockedText}>
                      ✦ {title}
                    </Text>
                  ))}
                </View>
              )}
              <View style={styles.resultActions}>
                <ActionButton label="Пройти радар ещё раз" onPress={() => startGame('radar')} />
                <ActionButton
                  label="На главный экран"
                  onPress={() => setScreen('home')}
                  variant="secondary"
                />
              </View>
            </View>
          )}

          {screen === 'result' && gameMode === 'mistakes' && (
            <View style={styles.resultCard}>
              <BrandMark />
              <View style={styles.resultMedallion}>
                <Text style={styles.resultMedallionText}>✓</Text>
              </View>
              <Text style={styles.homeOverline}>РАБОТА НАД ОШИБКАМИ</Text>
              <Text style={styles.resultTitle}>Позиции обновлены</Text>
              <Text style={styles.resultDescription}>
                Закрыто промахов: {attempts.filter((attempt) => attempt.correct).length}. Остались
                в портфеле: {stats.mistakeIds.length}.
              </Text>
              {newAchievementTitles.length > 0 && (
                <View style={styles.unlockedNotice}>
                  <Text style={styles.unlockedTitle}>Новые ачивки</Text>
                  {newAchievementTitles.map((title) => (
                    <Text key={title} style={styles.unlockedText}>
                      ✦ {title}
                    </Text>
                  ))}
                </View>
              )}
              <View style={styles.resultActions}>
                <ActionButton
                  label={`Продолжить разбор · ${stats.mistakeIds.length}`}
                  disabled={stats.mistakeIds.length === 0}
                  onPress={() => setScreen('mistakes')}
                />
                <ActionButton
                  label="На главный экран"
                  onPress={() => setScreen('home')}
                  variant="secondary"
                />
              </View>
            </View>
          )}

          {screen === 'result' && gameMode === 'millionaire' && gameResult !== null && (
            <View style={styles.resultCard}>
              <BrandMark />
              <View style={styles.resultMedallion}>
                <Text style={styles.resultMedallionText}>
                  {gameResult.type === 'won' ? '★' : gameResult.type === 'lost' ? '!' : '$'}
                </Text>
              </View>
              <Text style={styles.homeOverline}>
                {gameResult.type === 'won'
                  ? 'ПОБЕДА'
                  : gameResult.type === 'lost'
                    ? 'ИГРА ОКОНЧЕНА'
                    : 'ТВОЁ РЕШЕНИЕ'}
              </Text>
              <Text style={styles.resultTitle}>
                {gameResult.type === 'won'
                  ? 'Инвест-миллионер!'
                  : gameResult.type === 'lost'
                    ? 'Раунд завершён'
                    : 'Ты забираешь приз'}
              </Text>
              <Text style={styles.resultDescription}>
                {gameResult.type === 'won'
                  ? '15 правильных ответов - впечатляющий результат!'
                  : gameResult.type === 'lost'
                    ? gameResult.amount > 0
                      ? 'Несгораемая сумма остаётся за тобой.'
                      : 'На этот раз несгораемая сумма ещё не достигнута. Попробуй снова!'
                    : 'Иногда вовремя остановиться - тоже часть стратегии.'}
              </Text>
              <View style={styles.resultAmountCard}>
                <Text style={styles.resultAmountLabel}>ТВОЙ ВЫИГРЫШ</Text>
                <Text style={styles.resultAmount}>{formatPrize(gameResult.amount)}</Text>
                <Text style={styles.resultAnswers}>
                  Правильных ответов: {gameResult.correctAnswers} из {gameQuestions.length}
                </Text>
              </View>
              <View style={styles.resultActions}>
                <ActionButton
                  label="Сыграть ещё раз"
                  onPress={() => startGame('millionaire')}
                />
                <ActionButton
                  label={`Убыточные позиции · ${stats.mistakeIds.length}`}
                  disabled={stats.mistakeIds.length === 0}
                  onPress={() => setScreen('mistakes')}
                  variant="secondary"
                />
                <ActionButton
                  label="На главный экран"
                  onPress={() => setScreen('home')}
                  variant="secondary"
                />
              </View>
              <Text style={styles.disclaimer}>
                Игра носит образовательный характер и не является инвестиционной рекомендацией.
              </Text>
              {newAchievementTitles.length > 0 && (
                <View style={styles.unlockedNotice}>
                  <Text style={styles.unlockedTitle}>Новые ачивки</Text>
                  {newAchievementTitles.map((title) => (
                    <Text key={title} style={styles.unlockedText}>
                      ✦ {title}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          )}
        </ScrollView>

        <Modal
          animationType="fade"
          onRequestClose={() => setGameModal(null)}
          transparent
          visible={gameModal !== null}
        >
          <View style={styles.modalBackdrop}>
            <View accessibilityViewIsModal style={styles.modalCard}>
              <Text style={styles.modalEyebrow}>
                {gameModal?.type === 'consensus'
                  ? 'РЕЗУЛЬТАТ ОПРОСА'
                  : gameModal?.type === 'cashout'
                    ? 'ПЕРЕД ТЕМ КАК УЙТИ'
                    : gameModal?.type === 'exit'
                      ? 'ТЕКУЩИЙ РАУНД'
                      : 'ЗНАЧОК ПОЛУЧЕН'}
              </Text>
              <Text style={styles.modalTitle}>
                {gameModal?.type === 'consensus'
                  ? 'Консенсус Уолл-стрит'
                  : gameModal?.type === 'cashout'
                    ? 'Забрать деньги?'
                    : gameModal?.type === 'exit'
                      ? 'Вернуться на главный экран?'
                      : gameModal?.achievement.title}
              </Text>

              {gameModal?.type === 'consensus' && (
                <View style={styles.votes}>
                  {gameModal.votes.map((vote, index) => (
                    <View key={index} style={styles.voteRow}>
                      <Text style={styles.voteLetter}>{String.fromCharCode(65 + index)}</Text>
                      <View style={styles.voteTrack}>
                        <View
                          style={[
                            styles.voteBar,
                            { width: `${vote}%` },
                            index === question?.correctIndex && styles.voteBarCorrect,
                            index === gameModal.crowdPick && styles.voteBarConsensus,
                          ]}
                        />
                      </View>
                      <Text style={styles.votePercent}>{vote}%</Text>
                    </View>
                  ))}
                  <Text style={styles.consensusNote}>
                    {gameModal.crowdIsRight
                      ? 'Большинство склоняется к верному ответу - но решение за тобой.'
                      : 'Подвох: большинство ошибается. На рынке толпа не всегда права.'}
                  </Text>
                </View>
              )}

              {gameModal?.type === 'cashout' && (
                <>
                  <Text style={styles.cashoutMessage}>
                    Так мы денег на фондовом рынке не заработаем, УЧИ ТЕОРИЮ
                  </Text>
                  <Link href="https://pavlolomakin.github.io/Pavlo.Lomakin-learn/" asChild>
                    <Pressable accessibilityRole="link" style={styles.theoryLink}>
                      <Text style={styles.theoryLinkText}>Учи теорию ↗</Text>
                    </Pressable>
                  </Link>
                  <View style={styles.cashoutActions}>
                    <ActionButton label="Всё равно забрать приз" onPress={confirmCashout} />
                    <ActionButton
                      label="Продолжить игру"
                      onPress={() => setGameModal(null)}
                      variant="secondary"
                    />
                  </View>
                </>
              )}

              {gameModal?.type === 'exit' && (
                <>
                  <Text style={styles.cashoutMessage}>
                    Текущий раунд завершится без сохранения результатов.
                  </Text>
                  <View style={styles.cashoutActions}>
                    <ActionButton
                      label="Выйти на главный экран"
                      onPress={() => {
                        setGameModal(null);
                        setScreen('home');
                      }}
                    />
                    <ActionButton
                      label="Продолжить игру"
                      onPress={() => setGameModal(null)}
                      variant="secondary"
                    />
                  </View>
                </>
              )}

              {gameModal?.type === 'achievement' && (
                <>
                  <View style={styles.achievementDetailIcon}>
                    <Text style={styles.achievementDetailIconText}>
                      {ACHIEVEMENT_ICONS[gameModal.achievement.id]}
                    </Text>
                  </View>
                  <Text style={styles.achievementDetailDescription}>
                    {gameModal.achievement.description}
                  </Text>
                  <Text style={styles.achievementDetailDate}>
                    Получено:{' '}
                    {new Date(stats.unlocked[gameModal.achievement.id]).toLocaleDateString('ru-RU')}
                  </Text>
                  <ActionButton label="Понятно" onPress={() => setGameModal(null)} />
                </>
              )}

              {gameModal?.type === 'consensus' && (
                <ActionButton label="Понятно" onPress={() => setGameModal(null)} />
              )}
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#071126',
  },
  appBackground: {
    flex: 1,
    backgroundColor: '#071126',
  },
  page: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 1200,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  homePage: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  homePageCompact: {
    justifyContent: 'flex-start',
    paddingVertical: 12,
  },
  homeCard: {
    width: '100%',
    maxWidth: 620,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 34,
    borderWidth: 1,
    borderColor: '#253555',
    borderRadius: 28,
    backgroundColor: '#0d1b35',
  },
  homeCardCompact: {
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderRadius: 22,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  brandCompact: {
    gap: 10,
  },
  brandImageLink: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: GOLD,
    borderRadius: 15,
    overflow: 'hidden',
  },
  brandImage: {
    width: '100%',
    height: '100%',
  },
  brandCopy: {
    flexShrink: 1,
  },
  brandEyebrow: {
    color: MUTED,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  brandEyebrowCompact: {
    fontSize: 8,
  },
  brandName: {
    marginTop: 3,
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2,
  },
  brandNameCompact: {
    fontSize: 14,
    letterSpacing: 1.6,
  },
  goldDivider: {
    width: 72,
    height: 2,
    marginTop: 28,
    marginBottom: 26,
    backgroundColor: GOLD,
  },
  goldDividerCompact: {
    marginTop: 14,
    marginBottom: 10,
  },
  homeOverline: {
    color: GOLD,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    textAlign: 'center',
  },
  homeTitle: {
    marginTop: 16,
    color: '#f4f6fb',
    fontSize: 30,
    fontWeight: '700',
    textAlign: 'center',
  },
  homeTitleCompact: {
    marginTop: 8,
    fontSize: 24,
    lineHeight: 29,
  },
  homeTitleGold: {
    marginTop: 4,
    color: GOLD,
    fontSize: 34,
    fontWeight: '800',
    textAlign: 'center',
  },
  homeTitleGoldCompact: {
    marginTop: 0,
    fontSize: 27,
    lineHeight: 32,
  },
  homeDescription: {
    maxWidth: 470,
    marginTop: 18,
    marginBottom: 28,
    color: '#b3bfd4',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  homeDescriptionCompact: {
    marginTop: 10,
    marginBottom: 16,
    fontSize: 14,
    lineHeight: 20,
  },
  accountCard: {
    width: '100%',
    maxWidth: 400,
    gap: 12,
    marginBottom: 24,
    padding: 14,
    borderWidth: 1,
    borderColor: '#344969',
    borderRadius: 16,
    backgroundColor: '#111f3a',
  },
  accountCardCompact: {
    gap: 8,
    marginBottom: 14,
    padding: 12,
  },
  accountCopy: {
    gap: 6,
  },
  accountEyebrow: {
    color: GOLD,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  accountDescription: {
    color: '#e5ebf5',
    fontSize: 13,
    lineHeight: 19,
  },
  cloudStatus: {
    color: MUTED,
    fontSize: 11,
    lineHeight: 16,
  },
  homeActions: {
    width: '100%',
    maxWidth: 320,
    gap: 12,
  },
  homeActionsCompact: {
    gap: 8,
  },
  investorRankCard: {
    width: '100%',
    maxWidth: 320,
    gap: 10,
    marginBottom: 24,
    padding: 14,
    borderWidth: 1,
    borderColor: '#66552d',
    borderRadius: 16,
    backgroundColor: '#191f2c',
  },
  investorRankCardCompact: {
    gap: 8,
    marginBottom: 14,
    padding: 12,
  },
  investorRankHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  investorRankCopy: {
    flex: 1,
    gap: 4,
  },
  investorRankEyebrow: {
    color: MUTED,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  investorRankTitle: {
    color: GOLD,
    fontSize: 15,
    fontWeight: '800',
  },
  investorRankScore: {
    color: '#f5f7fc',
    fontSize: 16,
    fontWeight: '800',
  },
  investorRankNext: {
    color: MUTED,
    fontSize: 10,
  },
  errorMessage: {
    marginVertical: 12,
    color: '#ff9aa3',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  contentCard: {
    width: '100%',
    maxWidth: 780,
    alignSelf: 'center',
    gap: 18,
    padding: 24,
    borderWidth: 1,
    borderColor: '#253555',
    borderRadius: 24,
    backgroundColor: '#0d1b35',
  },
  sectionTitle: {
    marginTop: 8,
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '800',
  },
  rulesIntro: {
    color: '#b3bfd4',
    fontSize: 15,
    lineHeight: 23,
  },
  emptyState: {
    padding: 16,
    color: '#9baccb',
    fontSize: 14,
    lineHeight: 22,
    borderWidth: 1,
    borderColor: '#344969',
    borderRadius: 14,
  },
  mistakeList: {
    gap: 10,
  },
  mistakeRow: {
    padding: 14,
    borderWidth: 1,
    borderColor: '#344969',
    borderRadius: 14,
    backgroundColor: '#111f3a',
  },
  mistakeCategory: {
    marginBottom: 6,
    color: GOLD,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  mistakeQuestion: {
    color: '#e5ebf5',
    fontSize: 13,
    lineHeight: 19,
  },
  achievementGroup: {
    gap: 10,
    marginTop: 8,
  },
  achievementGroupTitle: {
    marginBottom: 2,
    color: GOLD,
    fontSize: 14,
    fontWeight: '800',
  },
  achievementRow: {
    gap: 7,
    padding: 13,
    borderWidth: 1,
    borderColor: '#344969',
    borderRadius: 13,
    backgroundColor: '#111f3a',
  },
  achievementUnlocked: {
    borderColor: '#8b7134',
    backgroundColor: '#211f1a',
  },
  unlockedBadgesSection: {
    gap: 10,
  },
  unlockedBadges: {
    gap: 10,
    paddingRight: 4,
  },
  achievementBadge: {
    width: 108,
    minHeight: 112,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#8b7134',
    borderRadius: 16,
    backgroundColor: '#211f1a',
  },
  achievementBadgeIcon: {
    fontSize: 32,
  },
  achievementBadgeTitle: {
    color: '#f1e4bd',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
    textAlign: 'center',
  },
  achievementHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  achievementTitle: {
    flex: 1,
    color: '#f1f4fa',
    fontSize: 13,
    fontWeight: '800',
  },
  achievementProgress: {
    color: GOLD,
    fontSize: 11,
    fontWeight: '700',
  },
  achievementDescription: {
    color: '#aebbd0',
    fontSize: 11,
    lineHeight: 16,
  },
  progressTrack: {
    height: 6,
    overflow: 'hidden',
    borderRadius: 3,
    backgroundColor: '#273958',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: GOLD,
  },
  radarChartCard: {
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
    padding: 10,
    borderWidth: 1,
    borderColor: '#344969',
    borderRadius: 20,
    backgroundColor: '#0a1730',
  },
  skillList: {
    width: '100%',
    gap: 14,
  },
  skillRow: {
    gap: 5,
  },
  skillLabelLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  skillLabel: {
    color: '#e5ebf5',
    fontSize: 13,
    fontWeight: '700',
  },
  skillPercentage: {
    color: GOLD,
    fontSize: 13,
    fontWeight: '800',
  },
  skillAttempts: {
    color: MUTED,
    fontSize: 10,
  },
  unlockedNotice: {
    alignSelf: 'stretch',
    gap: 6,
    padding: 14,
    borderWidth: 1,
    borderColor: '#8b7134',
    borderRadius: 14,
    backgroundColor: '#211f1a',
  },
  unlockedTitle: {
    marginBottom: 2,
    color: GOLD,
    fontSize: 12,
    fontWeight: '800',
  },
  unlockedText: {
    color: '#f1e4bd',
    fontSize: 12,
    lineHeight: 18,
  },
  disclaimer: {
    maxWidth: 420,
    marginTop: 24,
    color: '#71809c',
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
  },
  disclaimerCompact: {
    marginTop: 14,
    fontSize: 10,
    lineHeight: 14,
  },
  actionButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderWidth: 1,
    borderRadius: 14,
  },
  actionButtonCompact: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 11,
  },
  primaryButton: {
    borderColor: GOLD,
    backgroundColor: GOLD,
  },
  secondaryButton: {
    borderColor: '#4b5c7c',
    backgroundColor: '#142440',
  },
  subtleButton: {
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  primaryButtonText: {
    color: '#101a2d',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  primaryButtonTextCompact: {
    fontSize: 14,
  },
  secondaryButtonText: {
    color: '#eef2fa',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  secondaryButtonTextCompact: {
    fontSize: 12,
  },
  buttonPressed: {
    opacity: 0.78,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  gameScreen: {
    flex: 1,
  },
  gameHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 24,
  },
  gameHeaderCompact: {
    gap: 8,
    marginBottom: 8,
  },
  gamePageCompact: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  brandImageLinkCompact: {
    width: 38,
    height: 38,
    borderRadius: 12,
  },
  questionCount: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#334667',
    borderRadius: 999,
    backgroundColor: '#101f3c',
  },
  questionCountCompact: {
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  questionCountText: {
    color: GOLD,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  gameLayout: {
    gap: 20,
  },
  gameLayoutCompact: {
    gap: 8,
  },
  gameLayoutWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  questionColumn: {
    flex: 1,
    gap: 14,
  },
  questionColumnCompact: {
    gap: 8,
  },
  questionCard: {
    padding: 22,
    borderWidth: 1,
    borderColor: '#263958',
    borderRadius: 22,
    backgroundColor: '#0d1b35',
  },
  questionCardCompact: {
    padding: 12,
    borderRadius: 17,
  },
  questionEyebrow: {
    color: GOLD,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  questionTitle: {
    marginTop: 12,
    marginBottom: 22,
    color: '#f5f7fc',
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 32,
  },
  questionTitleCompact: {
    marginTop: 7,
    marginBottom: 12,
    fontSize: 18,
    lineHeight: 23,
  },
  answers: {
    gap: 10,
  },
  answersCompact: {
    gap: 7,
  },
  answersWide: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  answerOption: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#344969',
    borderRadius: 14,
    backgroundColor: '#111f3a',
  },
  answerOptionCompact: {
    minHeight: 46,
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
  },
  answerOptionWide: {
    width: '48%',
  },
  answerSelected: {
    borderColor: '#f39b45',
    backgroundColor: '#3b2b22',
  },
  answerCorrect: {
    borderColor: '#58c99a',
    backgroundColor: '#15382f',
  },
  answerWrong: {
    borderColor: '#e16c79',
    backgroundColor: '#42252f',
  },
  answerPressed: {
    opacity: 0.8,
  },
  answerLetter: {
    width: 28,
    height: 28,
    overflow: 'hidden',
    color: GOLD,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 28,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#566784',
    borderRadius: 14,
  },
  answerLetterCorrect: {
    color: '#86e4bb',
    borderColor: '#58c99a',
  },
  answerLetterWrong: {
    color: '#ff9aa3',
    borderColor: '#e16c79',
  },
  answerText: {
    flex: 1,
    color: '#edf2fa',
    fontSize: 14,
    lineHeight: 20,
  },
  answerTextCompact: {
    fontSize: 13,
    lineHeight: 17,
  },
  feedbackCard: {
    marginTop: 18,
    padding: 14,
    borderWidth: 1,
    borderRadius: 14,
  },
  feedbackCorrect: {
    borderColor: '#347f68',
    backgroundColor: '#102d28',
  },
  feedbackWrong: {
    borderColor: '#864753',
    backgroundColor: '#321e2a',
  },
  feedbackSaved: {
    borderColor: '#9b7a31',
    backgroundColor: '#302a1d',
  },
  feedbackTitle: {
    marginBottom: 6,
    fontSize: 14,
    fontWeight: '800',
  },
  feedbackTitleCorrect: {
    color: '#80e0b5',
  },
  feedbackTitleWrong: {
    color: '#ff9aa3',
  },
  feedbackTitleSaved: {
    color: GOLD,
  },
  feedbackText: {
    color: '#c4cee0',
    fontSize: 13,
    lineHeight: 20,
  },
  lifelinesCard: {
    padding: 16,
    borderWidth: 1,
    borderColor: '#263958',
    borderRadius: 18,
    backgroundColor: '#0d1b35',
  },
  lifelinesCardCompact: {
    padding: 10,
    borderRadius: 14,
  },
  lifelinesHeading: {
    marginBottom: 12,
    color: MUTED,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  lifelinesHeadingCompact: {
    marginBottom: 7,
  },
  stopLossNote: {
    marginTop: 10,
    color: GOLD,
    fontSize: 11,
    fontWeight: '700',
  },
  lifelines: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  lifelineButton: {
    minHeight: 40,
    flexGrow: 1,
    flexBasis: 105,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#455979',
    borderRadius: 12,
    backgroundColor: '#142440',
  },
  lifelineUsed: {
    borderColor: '#31405c',
    backgroundColor: '#101a2d',
  },
  lifelineText: {
    color: '#ecf1f8',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  lifelineUsedText: {
    color: '#8492aa',
  },
  gameActions: {
    gap: 10,
  },
  gameActionsCompact: {
    gap: 6,
  },
  ladderColumn: {
    width: '100%',
  },
  ladderColumnWide: {
    width: 286,
  },
  ladderCard: {
    padding: 17,
    borderWidth: 1,
    borderColor: '#263958',
    borderRadius: 20,
    backgroundColor: '#0d1b35',
  },
  ladderTitle: {
    marginBottom: 12,
    color: MUTED,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  ladderRow: {
    minHeight: 27,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    borderRadius: 7,
  },
  ladderRowCurrent: {
    backgroundColor: '#4a3b20',
  },
  ladderRowSafe: {
    borderTopWidth: 1,
    borderTopColor: '#2b3c58',
  },
  ladderNumber: {
    width: 22,
    color: '#7f8eaa',
    fontSize: 11,
    fontWeight: '700',
  },
  ladderPrize: {
    color: '#d0d8e7',
    fontSize: 12,
    fontWeight: '600',
  },
  ladderTextCurrent: {
    color: GOLD,
    fontWeight: '800',
  },
  ladderTextSafe: {
    color: '#f3d98c',
  },
  safeLabel: {
    marginLeft: 'auto',
    color: '#c4a653',
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  ladderNote: {
    marginTop: 12,
    color: '#7f8eaa',
    fontSize: 10,
    lineHeight: 15,
  },
  resultCard: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    alignItems: 'center',
    padding: 28,
    borderWidth: 1,
    borderColor: '#293a5b',
    borderRadius: 26,
    backgroundColor: '#0d1b35',
  },
  resultMedallion: {
    width: 68,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: GOLD,
    borderRadius: 34,
    backgroundColor: '#352e20',
  },
  resultMedallionText: {
    color: GOLD,
    fontSize: 30,
    fontWeight: '800',
  },
  resultTitle: {
    marginTop: 10,
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '800',
    textAlign: 'center',
  },
  resultDescription: {
    maxWidth: 420,
    marginTop: 10,
    color: '#b3bfd4',
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
  },
  resultAmountCard: {
    width: '100%',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: '#66552d',
    borderRadius: 18,
    backgroundColor: '#191f2c',
  },
  resultAmountLabel: {
    color: MUTED,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  resultAmount: {
    marginTop: 8,
    color: GOLD,
    fontSize: 36,
    fontWeight: '800',
  },
  resultAnswers: {
    marginTop: 6,
    color: '#9baccb',
    fontSize: 12,
  },
  resultActions: {
    width: '100%',
    maxWidth: 320,
    gap: 10,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'rgba(2, 8, 20, 0.82)',
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    padding: 24,
    borderWidth: 1,
    borderColor: '#415576',
    borderRadius: 22,
    backgroundColor: '#10203c',
  },
  modalEyebrow: {
    color: GOLD,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  modalTitle: {
    marginTop: 8,
    marginBottom: 20,
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
  },
  votes: {
    gap: 13,
    marginBottom: 22,
  },
  voteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  voteLetter: {
    width: 18,
    color: '#e5ebf5',
    fontSize: 13,
    fontWeight: '800',
  },
  voteTrack: {
    flex: 1,
    height: 12,
    overflow: 'hidden',
    borderRadius: 6,
    backgroundColor: '#273958',
  },
  voteBar: {
    height: '100%',
    borderRadius: 6,
    backgroundColor: '#7283a2',
  },
  voteBarCorrect: {
    backgroundColor: GOLD,
  },
  voteBarConsensus: {
    backgroundColor: '#f39b45',
  },
  consensusNote: {
    marginTop: 6,
    color: '#b3bfd4',
    fontSize: 12,
    lineHeight: 18,
  },
  votePercent: {
    width: 38,
    color: '#e5ebf5',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  cashoutMessage: {
    color: '#f5f7fc',
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 25,
  },
  theoryLink: {
    alignSelf: 'flex-start',
    marginTop: 14,
    marginBottom: 20,
  },
  theoryLinkText: {
    color: GOLD,
    fontSize: 15,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  cashoutActions: {
    gap: 10,
  },
  achievementDetailIcon: {
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: GOLD,
    borderRadius: 38,
    backgroundColor: '#352e20',
  },
  achievementDetailIconText: {
    fontSize: 38,
  },
  achievementDetailDescription: {
    marginBottom: 14,
    color: '#e5ebf5',
    fontSize: 15,
    lineHeight: 23,
  },
  achievementDetailDate: {
    marginBottom: 20,
    color: MUTED,
    fontSize: 12,
  },
});
