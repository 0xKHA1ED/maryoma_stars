import { BADGES } from "../content/badges.js";
import { LOVE_NOTES, MASCOT_STAGES, REWARD_LADDER, ROOM_STAGES, TITLE_STAGES } from "../content/rewards.js";
import { addDays, diffDays, getMonthKey, getMonthRange, getWeekday, isWeekend, uniqueDateStrings } from "./date.js";

function hashString(value) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 2147483647;
  }

  return hash;
}

function getLatestReachedStage(stages, totalStars) {
  return stages.reduce((currentStage, stage) => {
    return totalStars >= stage.threshold ? stage : currentStage;
  }, stages[0]);
}

function getNextStage(stages, totalStars) {
  return stages.find((stage) => totalStars < stage.threshold) ?? null;
}

function buildMonthCounts(sortedDates) {
  return sortedDates.reduce((counts, dateString) => {
    const monthKey = getMonthKey(dateString);
    counts[monthKey] = (counts[monthKey] ?? 0) + 1;
    return counts;
  }, {});
}

function getRollingWindowMax(sortedDates, windowSize) {
  let leftIndex = 0;
  let best = 0;

  for (let rightIndex = 0; rightIndex < sortedDates.length; rightIndex += 1) {
    while (diffDays(sortedDates[leftIndex], sortedDates[rightIndex]) > windowSize - 1) {
      leftIndex += 1;
    }

    best = Math.max(best, rightIndex - leftIndex + 1);
  }

  return best;
}

function getCurrentWindowCount(sortedDates, endDate, windowSize) {
  const startDate = addDays(endDate, -(windowSize - 1));
  return sortedDates.filter((dateString) => dateString >= startDate && dateString <= endDate).length;
}

function buildDateMetaMap(sortedDates) {
  let streak = 0;

  return sortedDates.reduce((metaMap, dateString, index) => {
    const previousDate = sortedDates[index - 1] ?? null;
    const gapFromPrevious = previousDate ? diffDays(previousDate, dateString) : null;
    streak = gapFromPrevious === 1 ? streak + 1 : 1;

    const isFirstOfMonth = !previousDate || getMonthKey(previousDate) !== getMonthKey(dateString);
    const rareSparkle = hashString(dateString) % 29 === 0;
    const seasonalBlossom = hashString(`season:${dateString}`) % 7 === 0;
    const weekday = getWeekday(dateString);
    const totalAtDate = index + 1;

    let skinId = "default";

    if (rareSparkle) {
      skinId = "comet";
    } else if (isFirstOfMonth) {
      skinId = "ribbon";
    } else if (totalAtDate % 10 === 0) {
      skinId = "crown";
    } else if (streak >= 7 && streak % 2 === 1) {
      skinId = "moon";
    } else if (totalAtDate % 5 === 0) {
      skinId = "heart";
    } else if (seasonalBlossom) {
      skinId = "blossom";
    }

    metaMap[dateString] = {
      dateString,
      totalAtDate,
      streakAtDate: streak,
      gapFromPrevious,
      isFirstOfMonth,
      rareSparkle,
      seasonalBlossom,
      weekday,
      isWeekend: isWeekend(dateString),
      skinId,
    };

    return metaMap;
  }, {});
}

function evaluateBadge(badge, context) {
  switch (badge.category) {
    case "lifetime":
      return context.totalStars >= badge.threshold;
    case "streak":
      return context.bestStreak >= badge.threshold;
    case "weekly":
      return context.bestWeeklyWindow >= badge.threshold;
    case "monthly":
      return context.bestMonthCount >= badge.threshold;
    case "comeback":
      return context.comebackDates.length > 0;
    case "weekday":
      return context.sortedDates.some((dateString) => getWeekday(dateString) === badge.weekday);
    case "weekend":
      return context.sortedDates.some((dateString) => isWeekend(dateString));
    case "first_of_month":
      return context.sortedDates.some((dateString) => context.dateMetaMap[dateString]?.isFirstOfMonth);
    case "rare":
      return context.sortedDates.some((dateString) => context.dateMetaMap[dateString]?.rareSparkle);
    default:
      return false;
  }
}

function getNextUnlock(totalStars) {
  const steps = [
    ...REWARD_LADDER.map((item) => ({ threshold: item.threshold, label: item.title, type: "reward" })),
    ...LOVE_NOTES.map((item) => ({ threshold: item.threshold, label: item.title, type: "note" })),
    ...TITLE_STAGES.map((item) => ({ threshold: item.threshold, label: item.title, type: "title" })),
  ]
    .sort((left, right) => left.threshold - right.threshold)
    .filter((item, index, items) => {
      return index === items.findIndex((comparison) => comparison.threshold === item.threshold && comparison.type === item.type);
    });

  const nextItem = steps.find((item) => item.threshold > totalStars) ?? null;
  const previousItem = [...steps].reverse().find((item) => item.threshold <= totalStars) ?? null;

  const previousThreshold = previousItem?.threshold ?? 0;
  const nextThreshold = nextItem?.threshold ?? (totalStars || 1);
  const span = Math.max(1, nextThreshold - previousThreshold);
  const progress = nextItem ? Math.min(100, Math.round(((totalStars - previousThreshold) / span) * 100)) : 100;

  return {
    previousItem,
    nextItem,
    progress,
  };
}

export function deriveAll(workedDates, todayDate, activeMonthKey) {
  const sortedDates = uniqueDateStrings(workedDates);
  const totalStars = sortedDates.length;
  const workedSet = new Set(sortedDates);
  const hasWorkedToday = workedSet.has(todayDate);
  const lastWorkedDate = sortedDates.at(-1) ?? null;
  const dateMetaMap = buildDateMetaMap(sortedDates);
  const monthCounts = buildMonthCounts(sortedDates);
  const currentMonthKey = getMonthKey(todayDate);
  const monthlyBloom = monthCounts[currentMonthKey] ?? 0;
  const bestMonthCount = Math.max(0, ...Object.values(monthCounts));
  const bestWeeklyWindow = getRollingWindowMax(sortedDates, 7);
  const weeklyShine = getCurrentWindowCount(sortedDates, todayDate, 7);
  const bestStreak = Math.max(0, ...Object.values(dateMetaMap).map((meta) => meta.streakAtDate));
  const currentStreak =
    lastWorkedDate && diffDays(lastWorkedDate, todayDate) <= 1 ? dateMetaMap[lastWorkedDate]?.streakAtDate ?? 0 : 0;
  const daysSinceLastWorked = lastWorkedDate ? diffDays(lastWorkedDate, todayDate) : null;
  const comebackDates = sortedDates.filter((dateString) => (dateMetaMap[dateString]?.gapFromPrevious ?? 0) >= 4);
  const unlockedBadges = BADGES.filter((badge) =>
    evaluateBadge(badge, {
      totalStars,
      bestStreak,
      bestWeeklyWindow,
      bestMonthCount,
      sortedDates,
      dateMetaMap,
      comebackDates,
    }),
  );
  const unlockedRewards = REWARD_LADDER.filter((reward) => totalStars >= reward.threshold);
  const unlockedLoveNotes = LOVE_NOTES.filter((note) => totalStars >= note.threshold);
  const activeTitle = getLatestReachedStage(TITLE_STAGES, totalStars);
  const nextTitle = getNextStage(TITLE_STAGES, totalStars);
  const mascotStage = getLatestReachedStage(MASCOT_STAGES, totalStars);
  const roomStage = getLatestReachedStage(ROOM_STAGES, totalStars);
  const nextReward = REWARD_LADDER.find((reward) => totalStars < reward.threshold) ?? null;
  const nextUnlock = getNextUnlock(totalStars);
  const activeMonthRange = getMonthRange(activeMonthKey);
  const activeMonthTotal = sortedDates.filter(
    (dateString) => dateString >= activeMonthRange.firstDate && dateString <= activeMonthRange.lastDate,
  ).length;
  const badgeIdSet = new Set(unlockedBadges.map((badge) => badge.id));
  const rewardIdSet = new Set(unlockedRewards.map((reward) => reward.id));
  const noteIdSet = new Set(unlockedLoveNotes.map((note) => note.id));

  return {
    totalStars,
    sortedDates,
    workedSet,
    hasWorkedToday,
    lastWorkedDate,
    daysSinceLastWorked,
    dateMetaMap,
    monthCounts,
    currentMonthKey,
    activeMonthKey,
    activeMonthTotal,
    weeklyShine,
    monthlyBloom,
    bestWeeklyWindow,
    bestMonthCount,
    currentStreak,
    bestStreak,
    comebackDates,
    unlockedBadges,
    unlockedRewards,
    unlockedLoveNotes,
    activeTitle,
    nextTitle,
    mascotStage,
    roomStage,
    nextReward,
    nextUnlock,
    recentDates: [...sortedDates].reverse().slice(0, 12),
    badgeIdSet,
    rewardIdSet,
    noteIdSet,
  };
}

export function deriveClaimOutcome(previousDerived, nextDerived, claimDate) {
  const claimMeta = nextDerived.dateMetaMap[claimDate];
  const newBadges = nextDerived.unlockedBadges.filter((badge) => !previousDerived.badgeIdSet.has(badge.id));
  const newRewards = nextDerived.unlockedRewards.filter((reward) => !previousDerived.rewardIdSet.has(reward.id));
  const newLoveNotes = nextDerived.unlockedLoveNotes.filter((note) => !previousDerived.noteIdSet.has(note.id));

  return {
    claimDate,
    claimMeta,
    totalStars: nextDerived.totalStars,
    isFirstEver: nextDerived.totalStars === 1,
    streakIncreased: nextDerived.currentStreak > previousDerived.currentStreak,
    currentStreak: nextDerived.currentStreak,
    newBadges,
    newRewards,
    newLoveNotes,
    comeback: (claimMeta?.gapFromPrevious ?? 0) >= 4,
    firstOfMonth: claimMeta?.isFirstOfMonth ?? false,
    rareSparkle: claimMeta?.rareSparkle ?? false,
    grandCeremony: nextDerived.totalStars % 10 === 0,
  };
}
