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

type SavedState = {
  plannerGoal: string;
  plannerProblem: string;
  actions: ActionItem[];
  proofLog: string;
  strictMode: boolean;
  deadlineTime: string;
  stakeBalance: number;
  stakePerMiss: number;
  totalPenalties: number;
  lastPenaltyDate: string;
};

type ProofEntry = {
  id: string;
  date: string;
  note: string;
  streak: number;
  progress: number;
};

const APP_STORAGE_KEY = "phd-buddy-v1";
const PROOF_DB_KEY = "phd-proof-db-v1";

const defaultState: SavedState = {
  plannerGoal: "",
  plannerProblem: "",
  actions: [],
  proofLog: "",
  strictMode: true,
  deadlineTime: "21:00",
  stakeBalance: 0,
  stakePerMiss: 15,
  totalPenalties: 0,
  lastPenaltyDate: "",
};

const getTodayKey = () => new Date().toISOString().slice(0, 10);
const normalizeTaskText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const toPositiveNumber = (value: string, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.round(parsed * 100) / 100;
};

const normalizeActions = (value: unknown): ActionItem[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const maybe = item as {
        id?: unknown;
        text?: unknown;
        completedDates?: unknown;
      };
      if (typeof maybe.id !== "string" || typeof maybe.text !== "string") return null;
      return {
        id: maybe.id,
        text: maybe.text,
        completedDates: Array.isArray(maybe.completedDates)
          ? maybe.completedDates.filter((entry): entry is string => typeof entry === "string")
          : [],
      };
    })
    .filter((item): item is ActionItem => {
      if (item === null) return false;
      const key = normalizeTaskText(item.text);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const loadSavedState = (): SavedState => {
  if (typeof window === "undefined") return defaultState;
  const saved = localStorage.getItem(APP_STORAGE_KEY);
  if (!saved) return defaultState;

  try {
    const parsed = JSON.parse(saved) as Partial<SavedState>;
    return {
      ...defaultState,
      ...parsed,
      actions: normalizeActions(parsed.actions),
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
    localStorage.removeItem(APP_STORAGE_KEY);
    return defaultState;
  }
};

const loadProofDb = (): ProofEntry[] => {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(PROOF_DB_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => {
        const item = entry as Partial<ProofEntry>;
        if (typeof item.id !== "string" || typeof item.note !== "string") return null;
        return {
          id: item.id,
          note: item.note,
          date: typeof item.date === "string" ? item.date : new Date().toISOString(),
          streak: typeof item.streak === "number" ? item.streak : 0,
          progress: typeof item.progress === "number" ? item.progress : 0,
        };
      })
      .filter((entry): entry is ProofEntry => entry !== null);
  } catch {
    localStorage.removeItem(PROOF_DB_KEY);
    return [];
  }
};

type Resistance =
  | "ambiguity"
  | "overwhelm"
  | "anxiety"
  | "inertia"
  | "perfectionism"
  | "default";

const detectResistance = (goal: string, blocker: string): Resistance => {
  const text = `${goal} ${blocker}`.toLowerCase();
  if (/(don't know where to start|not sure how|don't know what to do|where do i begin|no idea|confused about|what should i)/.test(text)) return "ambiguity";
  if (/(too much|so many things|everything|a lot to do|piling up|can't keep up|buried|behind on)/.test(text)) return "overwhelm";
  if (/(stressing|stressed|worried|scared|nervous|afraid|matters a lot|important|can't mess up|pressure)/.test(text)) return "anxiety";
  if (/(keep putting off|procrastinat|avoiding|haven't started|been meaning to|weeks|months|forever)/.test(text)) return "inertia";
  if (/(has to be perfect|not good enough|redoing|can't finish|keep starting over|nothing feels right)/.test(text)) return "perfectionism";
  return "default";
};

const buildSuggestedTasks = (goal: string, problem: string): string[] => {
  const cleanGoal = goal.trim() || "your main phd goal";
  const cleanProblem = problem.trim() || "starting feels hard";
  const resistance = detectResistance(cleanGoal, cleanProblem);
  const text = `${cleanGoal} ${cleanProblem}`.toLowerCase();
  const hasRoom = /(room|floor|vacuum|clean|tidy|organize|organise|mess)/.test(text);
  const hasSourdough = /(sourdough|starter|bread|bake)/.test(text);
  const hasPaper = /(paper|manuscript|thesis|research|journal|discussion|results|experiment|figure|figures)/.test(text);
  const hasEditingFigures = /(edit(ing)? figures?|figure edit|fix figures?|figure formatting|axis label)/.test(text);
  const hasDiscussion = /(write|draft).*(discussion)|discussion section/.test(text);
  const hasResults = /(write|draft).*(results?)|results section|experiment/.test(text);
  const hasProject = /(project|write|code|study|design|plan|finish)/.test(text);

  const tasks: string[] = [];

  tasks.push(
    hasRoom
      ? "Pick up everything on your floor and put it on your bed for 5 minutes."
      : "Clear your desk and throw away anything that does not belong there for 4 minutes.",
  );

  if (hasSourdough) {
    tasks.push("Feed your sourdough starter: 50g flour, 50g water, stir, and put the lid on.");
  } else if (hasEditingFigures || hasPaper) {
    tasks.push("Open your figure file, zoom in on figure 1, and set your toolbar for editing in 3 minutes.");
  } else {
    tasks.push("Open the file you need and set up only the tools you need in 3 minutes.");
  }

  if (hasEditingFigures) {
    tasks.push("Fix the axis labels and adjust font sizes on figure 1 for 10 minutes only, then stop.");
  } else if (hasDiscussion) {
    tasks.push("Open your discussion section, read your results section, and write one sentence about what your main finding means in 10 minutes only.");
  } else if (resistance === "ambiguity") {
    tasks.push("Open your project document and write one sentence: what done looks like for this project, 8 minutes only.");
  } else {
    tasks.push("Outline the next 3 steps for your project in bullet points for 8 minutes only.");
  }

  tasks.push(
    hasRoom
      ? "Vacuum the floor for 7 minutes and stop when the timer ends."
      : "Stand up, get water, and come back to your desk in 3 minutes.",
  );

  if (hasResults) {
    tasks.push("Pick one experiment, write one result sentence, and add the figure reference for 10 minutes only.");
  } else if (hasEditingFigures) {
    tasks.push("Export figure 1 as a 300 dpi PNG and do not touch figure 2 for 8 minutes only.");
  } else if (resistance === "anxiety") {
    tasks.push("Set a 10-minute timer, open your project, and finish one paragraph that starts with your best guess.");
  } else if (resistance === "inertia") {
    tasks.push("Set a 10-minute timer, open your project, and add exactly one sentence to move it forward.");
  } else if (resistance === "perfectionism") {
    tasks.push("Set a 10-minute timer, write one rough paragraph, and keep it even if it is imperfect.");
  } else {
    tasks.push("Set a 10-minute timer and finish one paragraph for your project, nothing more.");
  }

  tasks.push(
    hasPaper || hasProject
      ? "Save your document, close the file, and write one line for your next action in 2 minutes."
      : "Put a check mark next to what you finished and write one next action in 2 minutes.",
  );

  return tasks.slice(0, 6);
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

  const [stakeBalance, setStakeBalance] = useState(initialState.stakeBalance);
  const [stakePerMiss, setStakePerMiss] = useState(initialState.stakePerMiss);
  const [totalPenalties, setTotalPenalties] = useState(initialState.totalPenalties);
  const [lastPenaltyDate, setLastPenaltyDate] = useState(initialState.lastPenaltyDate);
  const [depositDraft, setDepositDraft] = useState("20");

  const [actionDraft, setActionDraft] = useState("");
  const [lastCelebration, setLastCelebration] = useState(0);
  const [proofDb, setProofDb] = useState<ProofEntry[]>(() => loadProofDb());
  const todayKey = getTodayKey();

  useEffect(() => {
    if (!isHydrated) return;
    localStorage.setItem(
      APP_STORAGE_KEY,
      JSON.stringify({
        plannerGoal,
        plannerProblem,
        actions,
        proofLog,
        strictMode,
        deadlineTime,
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
    stakeBalance,
    stakePerMiss,
    totalPenalties,
    lastPenaltyDate,
    isHydrated,
  ]);

  useEffect(() => {
    if (!isHydrated) return;
    localStorage.setItem(PROOF_DB_KEY, JSON.stringify(proofDb));
  }, [proofDb, isHydrated]);

  const completedCount = useMemo(
    () => actions.filter((action) => action.completedDates.includes(todayKey)).length,
    [actions, todayKey],
  );
  const dailyProgress = actions.length ? Math.round((completedCount / actions.length) * 100) : 0;
  const streak = useMemo(() => getCurrentStreak(actions, todayKey), [actions, todayKey]);
  const deadlinePassed = isPastDeadline(deadlineTime);

  const missedTasks = actions.filter((action) => !action.completedDates.includes(todayKey)).length;
  const rawPenalty = missedTasks * stakePerMiss;
  const penaltyToday = Math.min(stakeBalance, rawPenalty);
  const canApplyPenalty =
    strictMode && deadlinePassed && missedTasks > 0 && lastPenaltyDate !== todayKey && stakeBalance > 0;
  const strictStatus = !strictMode
    ? {
        chip: "strict mode off",
        chipClass: "bg-zinc-100 text-zinc-700 border border-zinc-200",
        note: "penalties are disabled.",
      }
    : canApplyPenalty
      ? {
          chip: "penalty active now",
          chipClass: "bg-rose-100 text-rose-700 border border-rose-200",
          note: "deadline passed and missed tasks exist. penalty can be applied.",
        }
      : deadlinePassed
        ? {
            chip: "no penalty right now",
            chipClass: "bg-emerald-100 text-emerald-700 border border-emerald-200",
            note: "deadline passed, but there is nothing to charge now.",
          }
        : {
            chip: "waiting for deadline",
            chipClass: "bg-amber-100 text-amber-700 border border-amber-200",
            note: "strict mode is armed. penalties only apply after the deadline.",
          };

  const accountabilityMessage =
    dailyProgress >= 100
      ? "you executed fully today. lock this in the proof log."
      : dailyProgress >= 60
        ? "strong momentum. finish one more and close the day clean."
        : "start now. first completion creates momentum fast.";

  const suggestActions = () => {
    const suggested = buildSuggestedTasks(plannerGoal.trim(), plannerProblem.trim());
    setActions(suggested.map((task) => ({ id: crypto.randomUUID(), text: task, completedDates: [] })));
  };

  const addAction = () => {
    const text = actionDraft.trim();
    if (!text) return;
    const incomingKey = normalizeTaskText(text);
    setActions((current) => {
      if (current.some((action) => normalizeTaskText(action.text) === incomingKey)) return current;
      return [...current, { id: crypto.randomUUID(), text, completedDates: [] }];
    });
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

  const saveProofToDb = () => {
    const note = proofLog.trim();
    if (!note) return;

    setProofDb((current) => [
      {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        note,
        streak,
        progress: dailyProgress,
      },
      ...current,
    ]);
    setProofLog("");
    setLastCelebration((current) => current + 1);
  };

  if (!isHydrated) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#fff7ed_0%,#ffffff_45%,#f8fafc_100%)]" />
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#dff2ff_0%,#ecf8ff_32%,#f8fde9_62%,#e4f4d3_100%)] px-4 py-8 sm:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_18%,rgba(255,255,255,0.8)_0%,transparent_24%),radial-gradient(circle_at_84%_12%,rgba(255,248,225,0.7)_0%,transparent_22%),radial-gradient(circle_at_50%_100%,rgba(134,197,127,0.22)_0%,transparent_58%)]" />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-8 top-12 h-10 w-40 rounded-full bg-white/70 blur-[1px]"
        animate={{ x: [0, 18, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute right-10 top-24 h-12 w-48 rounded-full bg-white/60 blur-[1px]"
        animate={{ x: [0, -16, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="relative mx-auto flex w-full max-w-6xl flex-col gap-5"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      >
        <Card className="rounded-[28px] border border-emerald-200/70 bg-[#fffdf4]/90 shadow-[0_20px_45px_-30px_rgba(61,93,52,0.55)] backdrop-blur-sm">
          <CardBody className="gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-[family-name:var(--font-manrope)] text-xs uppercase tracking-[0.2em] text-emerald-700/80">sprint planner</p>
                <h1 className="font-[family-name:var(--font-instrument-serif)] text-3xl text-[#334433] sm:text-5xl">
                  sprint buddy, get your shit done
                </h1>
              </div>
              <Chip color={dailyProgress >= 60 ? "success" : "warning"} variant="flat" className="font-[family-name:var(--font-manrope)]">
                today {dailyProgress}% complete
              </Chip>
            </div>
            <Progress aria-label="daily progress" value={dailyProgress} color="success" />
          </CardBody>
        </Card>

        <Card className="rounded-[28px] border border-sky-200/70 bg-[#fffef8]/95 shadow-[0_18px_40px_-30px_rgba(70,99,121,0.5)]">
          <CardHeader className="pb-1">
            <p className="font-[family-name:var(--font-space-grotesk)] text-lg font-semibold text-[#305074]">
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

        <Card className="rounded-[28px] border border-emerald-100/80 bg-[#fffef8]/95 shadow-[0_18px_40px_-30px_rgba(61,93,52,0.45)]">
          <CardHeader className="pb-1">
            <p className="font-[family-name:var(--font-space-grotesk)] text-lg font-semibold text-[#36524f]">
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
                <p className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/40 p-4 text-sm text-zinc-600">
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
                      className={`flex items-center justify-between gap-2 rounded-2xl border px-3 py-2 ${
                        doneToday ? "border-emerald-300 bg-emerald-50/80" : "border-emerald-100 bg-white/80"
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

        <Card className="rounded-[28px] border border-amber-200/80 bg-[#fffef8]/95 shadow-[0_18px_40px_-30px_rgba(139,98,53,0.45)]">
          <CardHeader className="pb-1">
            <p className="font-[family-name:var(--font-space-grotesk)] text-lg font-semibold text-[#7d5b2b]">
              3) strict deadline + money stake
            </p>
          </CardHeader>
          <CardBody className="gap-4">
            <Switch isSelected={strictMode} onValueChange={setStrictMode}>
              strict mode is {strictMode ? "on" : "off"}
            </Switch>
            <div className="rounded-2xl border border-amber-200/70 bg-amber-50/70 p-3">
              <div className="flex items-center gap-2">
                <Chip size="sm" className={strictStatus.chipClass} variant="flat">
                  {strictStatus.chip}
                </Chip>
              </div>
              <p className="mt-2 text-xs text-zinc-600">{strictStatus.note}</p>
            </div>

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

            <div className="rounded-2xl border border-amber-200/70 bg-amber-50/60 p-3 text-sm text-zinc-700">
              <p>
                wallet: <span className="font-semibold text-zinc-900">${stakeBalance.toFixed(2)}</span>
              </p>
              <p>
                penalties collected: <span className="font-semibold text-zinc-900">${totalPenalties.toFixed(2)}</span>
              </p>
              <p>
                today missed tasks: <span className="font-semibold text-zinc-900">{missedTasks}</span>
              </p>
              <p>
                potential penalty today: <span className="font-semibold text-zinc-900">${penaltyToday.toFixed(2)}</span>
              </p>
            </div>

            <Button color={canApplyPenalty ? "danger" : "default"} onPress={applyPenalty} isDisabled={!canApplyPenalty}>
              apply today&apos;s penalty
            </Button>

            <p className="text-xs text-zinc-500">
              this is a local accountability wallet in your browser (not a real bank transfer).
            </p>
          </CardBody>
        </Card>

        <Card className="relative overflow-hidden rounded-[28px] border border-emerald-200/70 bg-[#fffdf6]/95 shadow-[0_18px_40px_-30px_rgba(61,93,52,0.45)]">
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
            <p className="font-[family-name:var(--font-space-grotesk)] text-lg font-semibold text-[#35584f]">
              4) close your day
            </p>
          </CardHeader>
          <CardBody className="gap-3">
            <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/60 p-3 text-sm text-zinc-700">
              <p>
                <span className="font-semibold text-zinc-900">buddy check:</span> {accountabilityMessage}
              </p>
              <p>
                <span className="font-semibold text-zinc-900">streak:</span> {streak} day{streak === 1 ? "" : "s"} 🔥
              </p>
            </div>
            <Textarea
              label="proof log"
              placeholder="finished methods draft intro + sent update to advisor"
              value={proofLog}
              onValueChange={setProofLog}
              minRows={3}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button color="warning" onPress={saveProofToDb}>
                save proof entry
              </Button>
              <p className="text-xs text-zinc-500">saved entries: {proofDb.length}</p>
            </div>
            {proofDb.length > 0 ? (
              <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/50 p-3">
                <p className="mb-2 text-xs uppercase tracking-[0.12em] text-emerald-700/80">recent proof history</p>
                <div className="space-y-2">
                  {proofDb.slice(0, 4).map((entry) => (
                    <div key={entry.id} className="rounded-xl border border-emerald-100 bg-white/90 p-2 text-xs text-zinc-700">
                      <p className="font-semibold text-[#35584f]">
                        {new Date(entry.date).toLocaleString()} · streak {entry.streak} · {entry.progress}%
                      </p>
                      <p className="mt-1">{entry.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </CardBody>
        </Card>
        <p className="pb-2 text-center font-[family-name:var(--font-manrope)] text-xs text-emerald-900/70">
          made with &lt;3 by i
        </p>
      </motion.div>
    </div>
  );
}
