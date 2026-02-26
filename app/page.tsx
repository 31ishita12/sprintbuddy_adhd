"use client";

import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Input,
  Progress,
  Switch,
  Textarea,
} from "@heroui/react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

type ActionItem = {
  id: string;
  text: string;
  completedDates: string[];
};

type RewardItem = {
  id: string;
  title: string;
  unlockStreak: number;
  claimed: boolean;
};

type SavedState = {
  plannerGoal: string;
  plannerProblem: string;
  actions: ActionItem[];
  proofLog: string;
  strictMode: boolean;
  deadlineTime: string;
  weeklyTarget: number;
  rewards: RewardItem[];
  stakeBalance: number;
  stakePerMiss: number;
  totalPenalties: number;
  lastPenaltyDate: string;
};

const defaultState: SavedState = {
  plannerGoal: "",
  plannerProblem: "",
  actions: [],
  proofLog: "",
  strictMode: true,
  deadlineTime: "21:00",
  weeklyTarget: 10,
  rewards: [],
  stakeBalance: 0,
  stakePerMiss: 15,
  totalPenalties: 0,
  lastPenaltyDate: "",
};

const getTodayKey = () => new Date().toISOString().slice(0, 10);

const toPositiveNumber = (value: string, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.round(parsed * 100) / 100;
};

const normalizeActions = (value: unknown): ActionItem[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const maybe = item as {
        id?: unknown;
        text?: unknown;
        completedDates?: unknown;
      };
      if (typeof maybe.id !== "string" || typeof maybe.text !== "string") return null;
      if (!Array.isArray(maybe.completedDates)) {
        return { id: maybe.id, text: maybe.text, completedDates: [] };
      }
      return {
        id: maybe.id,
        text: maybe.text,
        completedDates: maybe.completedDates.filter(
          (entry): entry is string => typeof entry === "string",
        ),
      };
    })
    .filter((item): item is ActionItem => item !== null);
};

const normalizeRewards = (value: unknown): RewardItem[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const maybe = item as {
        id?: unknown;
        title?: unknown;
        unlockStreak?: unknown;
        claimed?: unknown;
      };
      if (typeof maybe.id !== "string" || typeof maybe.title !== "string") return null;
      return {
        id: maybe.id,
        title: maybe.title,
        unlockStreak:
          typeof maybe.unlockStreak === "number" && maybe.unlockStreak > 0
            ? Math.round(maybe.unlockStreak)
            : 3,
        claimed: Boolean(maybe.claimed),
      };
    })
    .filter((item): item is RewardItem => item !== null);
};

const loadSavedState = (): SavedState => {
  if (typeof window === "undefined") return defaultState;
  const saved = localStorage.getItem("phd-buddy-v1");
  if (!saved) return defaultState;

  try {
    const parsed = JSON.parse(saved) as Partial<SavedState>;
    return {
      ...defaultState,
      ...parsed,
      actions: normalizeActions(parsed.actions),
      rewards: normalizeRewards(parsed.rewards),
      weeklyTarget:
        typeof parsed.weeklyTarget === "number" && parsed.weeklyTarget > 0
          ? Math.round(parsed.weeklyTarget)
          : defaultState.weeklyTarget,
      stakeBalance:
        typeof parsed.stakeBalance === "number" && parsed.stakeBalance >= 0
          ? parsed.stakeBalance
          : defaultState.stakeBalance,
      stakePerMiss:
        typeof parsed.stakePerMiss === "number" && parsed.stakePerMiss >= 0
          ? parsed.stakePerMiss
          : defaultState.stakePerMiss,
      totalPenalties:
        typeof parsed.totalPenalties === "number" && parsed.totalPenalties >= 0
          ? parsed.totalPenalties
          : defaultState.totalPenalties,
    };
  } catch {
    localStorage.removeItem("phd-buddy-v1");
    return defaultState;
  }
};

const buildSuggestedTasks = (goal: string, problem: string): string[] => {
  const text = `${goal} ${problem}`.toLowerCase();
  const tasks: string[] = [
    "define one exact deliverable for today in one sentence",
    "run one 25-minute deep-work sprint on the hardest task first",
    "write one proof note of what moved forward and by how much",
  ];

  if (/(read|paper|literature|review|article|source)/.test(text)) {
    tasks.push("read one paper and capture exactly 3 notes for your thesis");
  }
  if (/(write|draft|chapter|manuscript|thesis|proposal)/.test(text)) {
    tasks.push("draft 200 words before any editing");
  }
  if (/(data|analysis|code|experiment|model|run|stat)/.test(text)) {
    tasks.push("finish one analysis run and save one evidence screenshot");
  }
  if (/(stuck|overwhelm|confus|procrast|delay|avoid)/.test(text)) {
    tasks.push("do a 10-minute rough first pass to break resistance");
  }

  if (tasks.length < 5) {
    tasks.push("send advisor/accountability buddy one concrete update");
  }

  return tasks.slice(0, 5);
};

const getCurrentStreak = (actions: ActionItem[], todayKey: string): number => {
  const daysWithCompletion = new Set<string>();
  for (const action of actions) {
    for (const day of action.completedDates) daysWithCompletion.add(day);
  }

  let streak = 0;
  const cursor = new Date(`${todayKey}T00:00:00`);
  while (true) {
    const key = cursor.toISOString().slice(0, 10);
    if (!daysWithCompletion.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
};

const getLast7Days = (todayKey: string) => {
  const end = new Date(`${todayKey}T00:00:00`);
  const days: { key: string; label: string }[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    days.push({
      key: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString("en-US", { weekday: "short" }),
    });
  }
  return days;
};

const isPastDeadline = (deadlineTime: string) => {
  const now = new Date();
  const [h, m] = deadlineTime.split(":").map((part) => Number(part));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return false;
  const deadline = new Date(now);
  deadline.setHours(h, m, 0, 0);
  return now.getTime() > deadline.getTime();
};

export default function Home() {
  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const [initialState] = useState<SavedState>(() => loadSavedState());
  const [plannerGoal, setPlannerGoal] = useState(initialState.plannerGoal);
  const [plannerProblem, setPlannerProblem] = useState(initialState.plannerProblem);
  const [actions, setActions] = useState<ActionItem[]>(initialState.actions);
  const [proofLog, setProofLog] = useState(initialState.proofLog);

  const [strictMode, setStrictMode] = useState(initialState.strictMode);
  const [deadlineTime, setDeadlineTime] = useState(initialState.deadlineTime);
  const [weeklyTarget, setWeeklyTarget] = useState(initialState.weeklyTarget);

  const [rewards, setRewards] = useState<RewardItem[]>(initialState.rewards);
  const [rewardTitleDraft, setRewardTitleDraft] = useState("");
  const [rewardStreakDraft, setRewardStreakDraft] = useState("3");

  const [stakeBalance, setStakeBalance] = useState(initialState.stakeBalance);
  const [stakePerMiss, setStakePerMiss] = useState(initialState.stakePerMiss);
  const [totalPenalties, setTotalPenalties] = useState(initialState.totalPenalties);
  const [lastPenaltyDate, setLastPenaltyDate] = useState(initialState.lastPenaltyDate);
  const [depositDraft, setDepositDraft] = useState("20");

  const [actionDraft, setActionDraft] = useState("");
  const [lastCelebration, setLastCelebration] = useState(0);
  const todayKey = getTodayKey();

  useEffect(() => {
    if (!isHydrated) return;
    localStorage.setItem(
      "phd-buddy-v1",
      JSON.stringify({
        plannerGoal,
        plannerProblem,
        actions,
        proofLog,
        strictMode,
        deadlineTime,
        weeklyTarget,
        rewards,
        stakeBalance,
        stakePerMiss,
        totalPenalties,
        lastPenaltyDate,
      }),
    );
  }, [
    plannerGoal,
    plannerProblem,
    actions,
    proofLog,
    strictMode,
    deadlineTime,
    weeklyTarget,
    rewards,
    stakeBalance,
    stakePerMiss,
    totalPenalties,
    lastPenaltyDate,
    isHydrated,
  ]);

  const completedCount = useMemo(
    () => actions.filter((action) => action.completedDates.includes(todayKey)).length,
    [actions, todayKey],
  );
  const dailyProgress = actions.length ? Math.round((completedCount / actions.length) * 100) : 0;
  const streak = useMemo(() => getCurrentStreak(actions, todayKey), [actions, todayKey]);
  const nextAction = actions.find((action) => !action.completedDates.includes(todayKey));
  const deadlinePassed = isPastDeadline(deadlineTime);
  const weeklyDays = useMemo(() => getLast7Days(todayKey), [todayKey]);
  const weeklyCompletionsByDay = useMemo(() => {
    const lookup = new Map<string, number>();
    for (const day of weeklyDays) lookup.set(day.key, 0);
    for (const action of actions) {
      for (const date of action.completedDates) {
        if (!lookup.has(date)) continue;
        lookup.set(date, (lookup.get(date) ?? 0) + 1);
      }
    }
    return lookup;
  }, [actions, weeklyDays]);
  const weeklyCompletions = useMemo(
    () => [...weeklyCompletionsByDay.values()].reduce((sum, value) => sum + value, 0),
    [weeklyCompletionsByDay],
  );
  const weeklyProgress = Math.min(100, Math.round((weeklyCompletions / weeklyTarget) * 100));

  const missedTasks = actions.filter((action) => !action.completedDates.includes(todayKey)).length;
  const rawPenalty = missedTasks * stakePerMiss;
  const penaltyToday = Math.min(stakeBalance, rawPenalty);
  const canApplyPenalty =
    strictMode && deadlinePassed && missedTasks > 0 && lastPenaltyDate !== todayKey && stakeBalance > 0;

  const accountabilityMessage =
    dailyProgress >= 100
      ? "you executed fully today. lock this in the proof log."
      : dailyProgress >= 60
        ? "strong momentum. finish one more and close the day clean."
        : "start now. first completion creates momentum fast.";

  const rewardMessage =
    dailyProgress >= 100
      ? "perfect day. reward unlocked."
      : dailyProgress >= 75
        ? "almost there. one task away from full reward."
        : dailyProgress >= 40
          ? "nice start. keep stacking wins."
          : "first completion unlocks your streak energy.";

  const suggestActions = () => {
    const suggested = buildSuggestedTasks(plannerGoal.trim(), plannerProblem.trim());
    setActions((current) => {
      const existing = new Set(current.map((item) => item.text.toLowerCase()));
      const next = [...current];
      for (const task of suggested) {
        if (existing.has(task.toLowerCase())) continue;
        next.push({ id: crypto.randomUUID(), text: task, completedDates: [] });
      }
      return next;
    });
  };

  const addAction = () => {
    const text = actionDraft.trim();
    if (!text) return;
    setActions((current) => [...current, { id: crypto.randomUUID(), text, completedDates: [] }]);
    setActionDraft("");
  };

  const toggleTodayComplete = (id: string) => {
    let celebrated = false;
    setActions((current) =>
      current.map((action) => {
        if (action.id !== id) return action;
        const doneToday = action.completedDates.includes(todayKey);
        if (doneToday) {
          return {
            ...action,
            completedDates: action.completedDates.filter((date) => date !== todayKey),
          };
        }
        celebrated = true;
        return {
          ...action,
          completedDates: [...action.completedDates, todayKey],
        };
      }),
    );
    if (celebrated) setLastCelebration((current) => current + 1);
  };

  const removeAction = (id: string) => {
    setActions((current) => current.filter((action) => action.id !== id));
  };

  const addReward = () => {
    const title = rewardTitleDraft.trim();
    if (!title) return;
    const unlockStreak = Math.max(1, Math.round(toPositiveNumber(rewardStreakDraft, 3)));
    setRewards((current) => [
      ...current,
      { id: crypto.randomUUID(), title, unlockStreak, claimed: false },
    ]);
    setRewardTitleDraft("");
    setRewardStreakDraft("3");
  };

  const claimReward = (id: string) => {
    setRewards((current) =>
      current.map((reward) =>
        reward.id === id && streak >= reward.unlockStreak
          ? { ...reward, claimed: true }
          : reward,
      ),
    );
    setLastCelebration((current) => current + 1);
  };

  const depositStake = () => {
    const amount = toPositiveNumber(depositDraft, 0);
    if (amount <= 0) return;
    setStakeBalance((current) => current + amount);
    setDepositDraft("20");
  };

  const applyPenalty = () => {
    if (!canApplyPenalty || penaltyToday <= 0) return;
    setStakeBalance((current) => Math.max(0, current - penaltyToday));
    setTotalPenalties((current) => current + penaltyToday);
    setLastPenaltyDate(todayKey);
    setLastCelebration((current) => current + 1);
  };

  if (!isHydrated) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#fff7ed_0%,#ffffff_45%,#f8fafc_100%)]" />
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_8%_12%,#fde68a_0%,transparent_35%),radial-gradient(circle_at_88%_5%,#93c5fd_0%,transparent_28%),linear-gradient(180deg,#fffbeb_0%,#ffffff_44%,#f8fafc_100%)] px-4 py-8 sm:px-8">
      <motion.div
        className="mx-auto flex w-full max-w-6xl flex-col gap-5"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      >
        <Card className="border border-amber-200/70 bg-white/90">
          <CardBody className="gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">phd action cockpit</p>
                <h1 className="font-[family-name:var(--font-space-grotesk)] text-3xl font-bold text-zinc-900 sm:text-4xl">
                  strict buddy, clear wins
                </h1>
              </div>
              <Chip color={dailyProgress >= 60 ? "success" : "warning"} variant="flat">
                today {dailyProgress}% complete
              </Chip>
            </div>
            <Progress aria-label="daily progress" value={dailyProgress} color="success" />
            <p className="text-sm text-zinc-700">
              <span className="font-semibold text-zinc-900">next action:</span>{" "}
              {nextAction ? nextAction.text : "all tasks complete today, claim your reward."}
            </p>
          </CardBody>
        </Card>

        <Card className="border border-violet-200/70 bg-white/95">
          <CardHeader className="pb-1">
            <p className="font-[family-name:var(--font-manrope)] text-lg font-semibold text-zinc-800">
              1) define today
            </p>
          </CardHeader>
          <CardBody className="gap-3">
            <Textarea
              label="goal"
              placeholder="finish methods section draft"
              value={plannerGoal}
              onValueChange={setPlannerGoal}
              minRows={2}
            />
            <Textarea
              label="blocker"
              placeholder="i overthink and delay starting"
              value={plannerProblem}
              onValueChange={setPlannerProblem}
              minRows={2}
            />
            <Button color="secondary" onPress={suggestActions}>
              generate strict daily actions
            </Button>
          </CardBody>
        </Card>

        <Card className="border border-zinc-200/80 bg-white/95">
          <CardHeader className="pb-1">
            <p className="font-[family-name:var(--font-manrope)] text-lg font-semibold text-zinc-800">
              2) execute tasks
            </p>
          </CardHeader>
          <CardBody className="gap-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                label="add your own action"
                placeholder="submit one paragraph to advisor"
                value={actionDraft}
                onValueChange={setActionDraft}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addAction();
                }}
              />
              <Button className="sm:mt-6" color="primary" onPress={addAction}>
                add
              </Button>
            </div>

            <div className="flex flex-col gap-2">
              {actions.length === 0 ? (
                <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
                  generate actions above to start execution.
                </p>
              ) : (
                actions.map((action) => {
                  const doneToday = action.completedDates.includes(todayKey);
                  return (
                    <motion.div
                      key={action.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
                        doneToday ? "border-emerald-300 bg-emerald-50" : "border-zinc-200 bg-white"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleTodayComplete(action.id)}
                        className="flex-1 text-left text-sm"
                      >
                        <span className="mr-2">{doneToday ? "✅" : "⭕"}</span>
                        <span className={doneToday ? "text-zinc-500 line-through" : "text-zinc-800"}>
                          {action.text}
                        </span>
                      </button>
                      <Button
                        size="sm"
                        color={doneToday ? "warning" : "success"}
                        variant="flat"
                        onPress={() => toggleTodayComplete(action.id)}
                      >
                        {doneToday ? "undo" : "done"}
                      </Button>
                      <Button size="sm" variant="light" color="danger" onPress={() => removeAction(action.id)}>
                        remove
                      </Button>
                    </motion.div>
                  );
                })
              )}
            </div>
          </CardBody>
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="border border-sky-200/80 bg-white/95">
            <CardHeader className="pb-1">
              <p className="font-[family-name:var(--font-manrope)] text-lg font-semibold text-zinc-800">
                3) strict deadline + money stake
              </p>
            </CardHeader>
            <CardBody className="gap-4">
              <Switch isSelected={strictMode} onValueChange={setStrictMode}>
                strict mode is {strictMode ? "on" : "off"}
              </Switch>

              <Input
                label="daily deadline"
                type="time"
                value={deadlineTime}
                onValueChange={setDeadlineTime}
              />

              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  label="deposit to commitment wallet ($)"
                  type="number"
                  value={depositDraft}
                  onValueChange={setDepositDraft}
                />
                <Button className="sm:mt-6" color="primary" variant="flat" onPress={depositStake}>
                  add stake
                </Button>
              </div>

              <Input
                label="penalty per missed task ($)"
                type="number"
                value={String(stakePerMiss)}
                onValueChange={(value) => setStakePerMiss(toPositiveNumber(value, 15))}
              />

              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
                <p>wallet: <span className="font-semibold text-zinc-900">${stakeBalance.toFixed(2)}</span></p>
                <p>penalties collected: <span className="font-semibold text-zinc-900">${totalPenalties.toFixed(2)}</span></p>
                <p>today missed tasks: <span className="font-semibold text-zinc-900">{missedTasks}</span></p>
                <p>potential penalty today: <span className="font-semibold text-zinc-900">${penaltyToday.toFixed(2)}</span></p>
              </div>

              <Button color={canApplyPenalty ? "danger" : "default"} onPress={applyPenalty} isDisabled={!canApplyPenalty}>
                apply today&apos;s penalty
              </Button>

              <p className="text-xs text-zinc-500">
                this is a local accountability wallet in your browser (not a real bank transfer).
              </p>
            </CardBody>
          </Card>

          <Card className="border border-emerald-200/80 bg-white/95">
            <CardHeader className="pb-1">
              <p className="font-[family-name:var(--font-manrope)] text-lg font-semibold text-zinc-800">
                4) weekly map + reward vault
              </p>
            </CardHeader>
            <CardBody className="gap-4">
              <Input
                label="weekly completion target"
                type="number"
                value={String(weeklyTarget)}
                onValueChange={(value) => setWeeklyTarget(Math.max(1, Math.round(toPositiveNumber(value, 10))))}
              />

              <Progress aria-label="weekly progress" value={weeklyProgress} color="secondary" />
              <p className="text-sm text-zinc-700">
                {weeklyCompletions} completions this week out of target {weeklyTarget}
              </p>

              <div className="grid grid-cols-7 gap-1">
                {weeklyDays.map((day) => {
                  const count = weeklyCompletionsByDay.get(day.key) ?? 0;
                  return (
                    <div key={day.key} className="rounded-md border border-zinc-200 bg-zinc-50 p-2 text-center text-xs">
                      <p className="font-semibold text-zinc-700">{day.label}</p>
                      <p className="text-zinc-900">{count}</p>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  label="reward"
                  placeholder="movie night"
                  value={rewardTitleDraft}
                  onValueChange={setRewardTitleDraft}
                />
                <Input
                  label="unlock at streak"
                  type="number"
                  value={rewardStreakDraft}
                  onValueChange={setRewardStreakDraft}
                />
                <Button className="sm:mt-6" color="success" variant="flat" onPress={addReward}>
                  add
                </Button>
              </div>

              <div className="flex flex-col gap-2">
                {rewards.length === 0 ? (
                  <p className="text-sm text-zinc-500">add rewards to make progress feel real.</p>
                ) : (
                  rewards.map((reward) => {
                    const unlocked = streak >= reward.unlockStreak;
                    return (
                      <div key={reward.id} className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2">
                        <p className="text-sm text-zinc-800">
                          {reward.claimed ? "🏅" : unlocked ? "🎁" : "🔒"} {reward.title} ({reward.unlockStreak}-day streak)
                        </p>
                        <Button
                          size="sm"
                          color="success"
                          variant="flat"
                          isDisabled={!unlocked || reward.claimed}
                          onPress={() => claimReward(reward.id)}
                        >
                          {reward.claimed ? "claimed" : "claim"}
                        </Button>
                      </div>
                    );
                  })
                )}
              </div>
            </CardBody>
          </Card>
        </div>

        <Card className="relative overflow-hidden border border-amber-200/70 bg-white/95">
          <AnimatePresence>
            {lastCelebration > 0 && (
              <motion.div
                key={lastCelebration}
                initial={{ opacity: 0, y: 10, scale: 0.9 }}
                animate={{ opacity: 1, y: -6, scale: 1 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="pointer-events-none absolute right-4 top-3 text-2xl"
              >
                ✨🏆🎉
              </motion.div>
            )}
          </AnimatePresence>

          <CardHeader className="pb-1">
            <p className="font-[family-name:var(--font-manrope)] text-lg font-semibold text-zinc-800">
              5) close your day
            </p>
          </CardHeader>
          <CardBody className="gap-3">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
              <p><span className="font-semibold text-zinc-900">reward status:</span> {rewardMessage}</p>
              <p><span className="font-semibold text-zinc-900">buddy check:</span> {accountabilityMessage}</p>
              <p><span className="font-semibold text-zinc-900">streak:</span> {streak} day{streak === 1 ? "" : "s"} 🔥</p>
            </div>
            <Textarea
              label="proof log"
              placeholder="finished methods draft intro + sent update to advisor"
              value={proofLog}
              onValueChange={setProofLog}
              minRows={3}
            />
          </CardBody>
        </Card>
      </motion.div>
    </div>
  );
}
