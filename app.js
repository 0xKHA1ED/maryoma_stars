import { BADGES } from "./content/badges.js";
import { MESSAGE_BANK, TONE_PACKS } from "./content/messages.js";
import { LOVE_NOTES, MASCOT_STAGES, REWARD_LADDER, ROOM_STAGES, TITLE_STAGES } from "./content/rewards.js";
import { getThemeForDate } from "./content/themes.js";
import { STAR_SKINS } from "./content/star-skins.js";
import {
  buildCalendarCells,
  daysAgoLabel,
  formatLongDate,
  getCurrentMonthKey,
  getDefaultTimeZone,
  getMonthLabel,
  getTodayDateString,
  getWeekdayLabel,
  normalizeTimeZone,
  shiftMonth,
} from "./lib/date.js";
import { deriveAll, deriveClaimOutcome } from "./lib/derived.js";
import {
  createBackupPayload,
  loadState,
  mergeDates,
  mergeImportedBackup,
  saveState,
} from "./lib/storage.js";
import { createSupabaseManager } from "./lib/supabase.js";

const config = window.__MARYOMA_CONFIG__ || {};
let state = loadState(config);

const runtime = {
  settingsOpen: false,
  toastTimer: null,
  lastClaimOutcome: null,
  isBooting: true,
  syncBusy: false,
  supabaseReady: false,
  serviceWorkerReady: false,
};

const supabaseState = {
  manager: null,
  available: false,
  user: null,
  unsubscribe: null,
};

const refs = {
  statusBanner: document.getElementById("status-banner"),
  todayScreen: document.getElementById("screen-today"),
  skyScreen: document.getElementById("screen-sky"),
  rewardsScreen: document.getElementById("screen-rewards"),
  notesScreen: document.getElementById("screen-notes"),
  celebrationLayer: document.getElementById("celebration-layer"),
  settingsSheet: document.getElementById("settings-sheet"),
  settingsBackdrop: document.getElementById("settings-backdrop"),
  settingsForm: document.getElementById("settings-form"),
  tonePackSelect: document.getElementById("tone-pack-select"),
  tonePreview: document.getElementById("tone-preview"),
  syncStatusCopy: document.getElementById("sync-status-copy"),
  magicLinkButton: document.getElementById("magic-link-button"),
  signOutButton: document.getElementById("sign-out-button"),
  toast: document.getElementById("toast"),
  loadingCurtain: document.getElementById("loading-curtain"),
  backupInput: document.getElementById("backup-input"),
  timezoneList: document.getElementById("timezone-list"),
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function hashSeed(value) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33 + value.charCodeAt(index)) % 2147483647;
  }

  return hash;
}

function pickMessage(tonePackId, category, seed) {
  const toneMessages = MESSAGE_BANK[tonePackId] || MESSAGE_BANK.sweet;
  const entries = toneMessages[category] || MESSAGE_BANK.sweet[category] || [];

  if (!entries.length) {
    return "";
  }

  return entries[hashSeed(`${tonePackId}:${category}:${seed}`) % entries.length];
}

function getTonePack(tonePackId) {
  return TONE_PACKS.find((pack) => pack.id === tonePackId) || TONE_PACKS[0];
}

function getTodayDate() {
  return getTodayDateString(state.settings.timeZone || getDefaultTimeZone());
}

function getMotionEnabled() {
  if (state.settings.motion === "on") {
    return true;
  }

  if (state.settings.motion === "off") {
    return false;
  }

  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function applyTheme(todayDate) {
  const theme = getThemeForDate(todayDate);
  const root = document.documentElement;
  Object.entries(theme.palette).forEach(([key, value]) => {
    root.style.setProperty(`--${key}`, value);
  });
  root.style.setProperty("--theme-name", `"${theme.name}"`);
  document.body.dataset.motion = getMotionEnabled() ? "on" : "off";
  return theme;
}

function renderIcon(name, className = "") {
  const cls = className ? ` class="${className}"` : "";

  switch (name) {
    case "spark":
      return `<svg viewBox="0 0 24 24"${cls} aria-hidden="true"><path d="M12 2.8 14.3 9l6.2 2.3-6.2 2.3L12 20l-2.3-6.4-6.2-2.3L9.7 9 12 2.8Z"></path></svg>`;
    case "star":
      return `<svg viewBox="0 0 24 24"${cls} aria-hidden="true"><path d="M12 2.6 14.6 8l5.9.9-4.3 4.2 1 6-5.2-2.8-5.2 2.8 1-6L3.5 8l5.9-.9 2.6-4.5Z"></path></svg>`;
    case "wand":
      return `<svg viewBox="0 0 24 24"${cls} aria-hidden="true"><path d="m5 19 6.6-6.6"></path><path d="m9 3 1.2 3.2L13.5 7.4l-3.3 1.2L9 12l-1.2-3.4L4.5 7.4l3.3-1.2L9 3Z"></path><path d="m15.5 11 1 2.6 2.5.9-2.5.9-1 2.6-1-2.6-2.5-.9 2.5-.9 1-2.6Z"></path></svg>`;
    case "streak":
      return `<svg viewBox="0 0 24 24"${cls} aria-hidden="true"><path d="m13.6 2.8-7 10.1h4.2L10.4 21l7-10.1h-4.2l.4-8.1Z"></path></svg>`;
    case "calendar":
      return `<svg viewBox="0 0 24 24"${cls} aria-hidden="true"><rect x="3.8" y="5" width="16.4" height="15.2" rx="3"></rect><path d="M7.5 3.5v3"></path><path d="M16.5 3.5v3"></path><path d="M3.8 9.5h16.4"></path></svg>`;
    case "crown":
      return `<svg viewBox="0 0 24 24"${cls} aria-hidden="true"><path d="m4.5 7 4.2 4.2L12 5l3.3 6.2L19.5 7l-1.4 10H5.9L4.5 7Z"></path></svg>`;
    case "moon":
      return `<svg viewBox="0 0 24 24"${cls} aria-hidden="true"><path d="M14.8 3.2a8.8 8.8 0 1 0 6 15.2A8 8 0 1 1 14.8 3.2Z"></path></svg>`;
    case "heart":
      return `<svg viewBox="0 0 24 24"${cls} aria-hidden="true"><path d="M12 20s-7.2-4.5-8.7-8.7C2 7.5 4.5 4.8 7.7 4.8c1.7 0 3 1 4.3 2.4 1.3-1.4 2.6-2.4 4.3-2.4 3.2 0 5.7 2.7 4.4 6.5C19.2 15.5 12 20 12 20Z"></path></svg>`;
    case "letter":
      return `<svg viewBox="0 0 24 24"${cls} aria-hidden="true"><path d="M4.5 7.4c0-1.3 1-2.4 2.4-2.4h10.2c1.3 0 2.4 1 2.4 2.4v9.3c0 1.3-1 2.4-2.4 2.4H6.9c-1.3 0-2.4-1-2.4-2.4V7.4Z"></path><path d="m5.2 7 6.8 5.4L18.8 7"></path></svg>`;
    case "mascot":
      return `<svg viewBox="0 0 24 24"${cls} aria-hidden="true"><path d="M7 11.5c0-3 2.2-5.2 5-5.2s5 2.2 5 5.2c0 2.7-1.8 4.9-4.2 5.7l.7 2.8h-3l.7-2.8C8.8 16.4 7 14.2 7 11.5Z"></path><path d="m8 7.4-1.7-2.8"></path><path d="m16 7.4 1.7-2.8"></path></svg>`;
    case "room":
      return `<svg viewBox="0 0 24 24"${cls} aria-hidden="true"><path d="M4.5 18.5V8.2c0-.8.5-1.5 1.2-1.8L12 4l6.3 2.4c.7.3 1.2 1 1.2 1.8v10.3"></path><path d="M9 18.5v-4.3h6v4.3"></path></svg>`;
    case "gift":
      return `<svg viewBox="0 0 24 24"${cls} aria-hidden="true"><path d="M4 9.6h16v10.6a1.8 1.8 0 0 1-1.8 1.8H5.8A1.8 1.8 0 0 1 4 20.2V9.6Z"></path><path d="M12 4.5c-1.4-1.6-3-2.2-4.3-1.4-1.4.9-1 2.9.8 3.8 1 .5 2.2.7 3.5.7V4.5Z"></path><path d="M12 4.5c1.4-1.6 3-2.2 4.3-1.4 1.4.9 1 2.9-.8 3.8-1 .5-2.2.7-3.5.7V4.5Z"></path><path d="M12 7.6v14.4"></path><path d="M4 9.6h16"></path></svg>`;
    case "bow":
      return `<svg viewBox="0 0 24 24"${cls} aria-hidden="true"><path d="M12 11.2c2.8-4.2 6.7-5.5 8.2-3.9 1.7 1.7-.2 5.5-4.5 6.1 1.9 1.1 2.6 3.7 1 5-1.5 1.2-4.3.3-4.7-2.8-.4 3.1-3.2 4-4.7 2.8-1.6-1.3-.9-3.9 1-5-4.3-.6-6.2-4.4-4.5-6.1 1.5-1.6 5.4-.3 8.2 3.9Z"></path></svg>`;
    default:
      return `<svg viewBox="0 0 24 24"${cls} aria-hidden="true"><circle cx="12" cy="12" r="8"></circle></svg>`;
  }
}

function renderBadgeGlyph(icon) {
  if (icon === "halo") {
    return `<span class="badge-glyph">${renderIcon("spark", "glyph-icon")}<span class="halo-ring"></span></span>`;
  }

  if (icon === "medallion") {
    return `<span class="badge-glyph">${renderIcon("gift", "glyph-icon")}</span>`;
  }

  if (icon === "petal" || icon === "flower" || icon === "garden") {
    return `<span class="badge-glyph">${renderIcon("heart", "glyph-icon")}</span>`;
  }

  if (icon === "ribbon") {
    return `<span class="badge-glyph">${renderIcon("bow", "glyph-icon")}</span>`;
  }

  if (icon === "comet") {
    return `<span class="badge-glyph">${renderIcon("spark", "glyph-icon")}</span>`;
  }

  return `<span class="badge-glyph">${renderIcon(icon === "moon" ? "moon" : icon === "crown" ? "crown" : icon === "heart" ? "heart" : "star", "glyph-icon")}</span>`;
}

function renderStarToken(skinId, label, size = "medium") {
  const skin = STAR_SKINS[skinId] || STAR_SKINS.default;
  const overlayMap = {
    crown: renderIcon("crown", "token-overlay"),
    ribbon: renderIcon("bow", "token-overlay"),
    heart: renderIcon("heart", "token-overlay"),
    moon: renderIcon("moon", "token-overlay"),
    comet: renderIcon("spark", "token-overlay"),
    blossom: renderIcon("heart", "token-overlay"),
  };

  const coreSvg =
    skinId === "heart"
      ? renderIcon("heart", "token-core")
      : skinId === "moon"
        ? renderIcon("moon", "token-core")
        : renderIcon("star", "token-core");

  return `
    <span class="star-token ${skin.className} size-${size}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
      ${coreSvg}
      ${overlayMap[skinId] || ""}
    </span>
  `;
}

function showToast(message) {
  refs.toast.textContent = message;
  refs.toast.classList.add("is-visible");

  window.clearTimeout(runtime.toastTimer);
  runtime.toastTimer = window.setTimeout(() => {
    refs.toast.classList.remove("is-visible");
  }, 2400);
}

function saveAndRender() {
  state = saveState(state);
  render();
}

function getSyncState() {
  const hasConfig = Boolean(state.settings.supabaseUrl && state.settings.supabaseAnonKey);
  const pendingCount = state.pendingClaims.length;
  const isOffline = !navigator.onLine;

  if (state.sync.lastError) {
    return {
      kind: "warning",
      label: "Sync sleepy",
      copy: state.sync.lastError,
    };
  }

  if (runtime.syncBusy) {
    return {
      kind: "busy",
      label: "Syncing",
      copy: "Updating your shrine in the background.",
    };
  }

  if (supabaseState.user) {
    if (pendingCount > 0 || isOffline) {
      return {
        kind: "queued",
        label: pendingCount > 0 ? `${pendingCount} queued` : "Offline",
        copy: pendingCount > 0
          ? "Stored locally and waiting to sync."
          : "Offline-safe local mode. New claims will queue for sync.",
      };
    }

    return {
      kind: "good",
      label: "Synced",
      copy: supabaseState.user.email
        ? `Signed in as ${supabaseState.user.email}.`
        : "Signed in and syncing across devices.",
    };
  }

  if (hasConfig) {
    return {
      kind: "ready",
      label: "Magic link ready",
      copy: "Add your email and send a link to turn on cloud sync.",
    };
  }

  return {
    kind: "local",
    label: "Local shrine",
    copy: "Everything works offline here. Add Supabase in settings for device sync.",
  };
}

function getSelectedSkyDate(derived, todayDate) {
  const activeMonth = state.ui.skyMonth;
  const selected = state.ui.selectedSkyDate;

  if (selected && selected.startsWith(activeMonth)) {
    return selected;
  }

  const latestInMonth = [...derived.sortedDates].reverse().find((dateString) => dateString.startsWith(activeMonth));

  if (latestInMonth) {
    return latestInMonth;
  }

  return todayDate.startsWith(activeMonth) ? todayDate : "";
}

function buildTodayMessage(derived, todayDate) {
  const tone = state.settings.tonePack;

  if (derived.totalStars === 0) {
    return {
      greeting: pickMessage(tone, "empty", `${todayDate}:empty`),
      ritual: pickMessage(tone, "prompt", `${todayDate}:ritual-empty`),
    };
  }

  if (derived.hasWorkedToday) {
    return {
      greeting: pickMessage(tone, "already", `${todayDate}:already`),
      ritual: pickMessage(tone, "claimed", `${todayDate}:claimed`),
    };
  }

  if ((derived.daysSinceLastWorked ?? 0) > 1) {
    return {
      greeting: pickMessage(tone, "comeback", `${todayDate}:comeback`),
      ritual: pickMessage(tone, "prompt", `${todayDate}:ritual-comeback`),
    };
  }

  if (derived.currentStreak >= 3) {
    return {
      greeting: pickMessage(tone, "streak", `${todayDate}:streak`),
      ritual: pickMessage(tone, "prompt", `${todayDate}:ritual-streak`),
    };
  }

  if (derived.monthlyBloom === 0) {
    return {
      greeting: pickMessage(tone, "monthly", `${todayDate}:monthly`),
      ritual: pickMessage(tone, "prompt", `${todayDate}:ritual-monthly`),
    };
  }

  return {
    greeting: pickMessage(tone, "greeting", `${todayDate}:greeting`),
    ritual: pickMessage(tone, "prompt", `${todayDate}:ritual`),
  };
}

function getNextUnlockCopy(derived) {
  if (!derived.nextUnlock.nextItem) {
    return {
      headline: "Every unlock shelf is open now.",
      detail: "The shrine is fully dressed and every future star is pure luxury.",
      progress: 100,
    };
  }

  const remaining = derived.nextUnlock.nextItem.threshold - derived.totalStars;

  return {
    headline: `${remaining} more ${remaining === 1 ? "star" : "stars"} to ${derived.nextUnlock.nextItem.label}`,
    detail: `Next ${derived.nextUnlock.nextItem.type} unlock at ${derived.nextUnlock.nextItem.threshold} total stars.`,
    progress: derived.nextUnlock.progress,
  };
}

function buildCelebrationCard(outcome) {
  if (!outcome) {
    return "";
  }

  const tone = state.settings.tonePack;
  let headline = pickMessage(tone, "claimed", `${outcome.claimDate}:celebrate`);

  if (outcome.isFirstEver) {
    headline = pickMessage(tone, "milestone", `${outcome.claimDate}:first`);
  } else if (outcome.comeback) {
    headline = pickMessage(tone, "comeback", `${outcome.claimDate}:comeback-card`);
  } else if (outcome.newRewards.length || outcome.newLoveNotes.length || outcome.grandCeremony) {
    headline = pickMessage(tone, "milestone", `${outcome.claimDate}:reward-card`);
  } else if (outcome.newBadges.length) {
    headline = pickMessage(tone, "badge", `${outcome.claimDate}:badge-card`);
  } else if (outcome.streakIncreased && outcome.currentStreak >= 3) {
    headline = pickMessage(tone, "streak", `${outcome.claimDate}:streak-card`);
  }

  const chips = [
    outcome.currentStreak >= 2 ? `<span class="mini-chip">Streak ${outcome.currentStreak}</span>` : "",
    outcome.comeback ? `<span class="mini-chip">Comeback day</span>` : "",
    outcome.firstOfMonth ? `<span class="mini-chip">Ribbon month opener</span>` : "",
    outcome.rareSparkle ? `<span class="mini-chip">Rare sparkle</span>` : "",
  ]
    .filter(Boolean)
    .join("");

  const unlockList = [...outcome.newRewards, ...outcome.newBadges, ...outcome.newLoveNotes]
    .slice(0, 4)
    .map((item) => `<li>${escapeHtml(item.title)}</li>`)
    .join("");

  return `
    <div class="celebration-card">
      <div class="celebration-top">
        ${renderIcon("gift", "section-icon")}
        <div>
          <p class="eyebrow">Ceremony complete</p>
          <h3>${escapeHtml(headline)}</h3>
        </div>
      </div>
      <div class="chip-row">${chips || `<span class="mini-chip">Total ${outcome.totalStars}</span>`}</div>
      ${unlockList ? `<ul class="unlock-list">${unlockList}</ul>` : `<p class="helper-copy">Your star flew into the sky and the shrine tucked it safely into place.</p>`}
    </div>
  `;
}

function renderStatCard(label, value, subcopy, iconName) {
  return `
    <article class="stat-card">
      <div class="stat-icon-wrap">${renderIcon(iconName, "stat-icon")}</div>
      <p class="stat-label">${escapeHtml(label)}</p>
      <p class="stat-value">${escapeHtml(value)}</p>
      <p class="stat-copy">${escapeHtml(subcopy)}</p>
    </article>
  `;
}

function renderTodayScreen(derived, theme, todayDate, syncState) {
  const tonePack = getTonePack(state.settings.tonePack);
  const todayMessage = buildTodayMessage(derived, todayDate);
  const nextUnlock = getNextUnlockCopy(derived);
  const recentStars = derived.recentDates.slice(0, 10);
  const activeTabCopy = derived.hasWorkedToday ? "Today's star is tucked safely away." : "A single tap turns effort into a new collectible.";

  refs.todayScreen.innerHTML = `
    <div class="screen-column">
      <article class="card hero-card">
        <div class="pill-row">
          <span class="pill">${escapeHtml(theme.name)}</span>
          <span class="pill pill-${escapeHtml(syncState.kind)}">${escapeHtml(syncState.label)}</span>
        </div>
        <p class="date-copy">${escapeHtml(formatLongDate(todayDate))}</p>
        <h2 class="hero-title">${escapeHtml(state.settings.nickname)}'s Star Shrine</h2>
        <p class="hero-copy">${escapeHtml(todayMessage.greeting)}</p>
        <div class="hero-meta">
          <div class="medallion">
            <span class="medallion-number">${derived.totalStars}</span>
            <span class="medallion-label">tracked stars</span>
          </div>
          <div class="hero-note">
            <p class="hero-note-title">${escapeHtml(derived.activeTitle.title)}</p>
            <p>${escapeHtml(theme.description)}</p>
            <p>${escapeHtml(tonePack.description)}</p>
          </div>
        </div>
      </article>

      <article class="card ritual-card">
        <div class="section-heading-row">
          <div>
            <p class="eyebrow">Daily Star Ritual</p>
            <h3>Did I work today?</h3>
          </div>
          ${renderIcon("wand", "section-icon")}
        </div>
        <p class="ritual-copy">${escapeHtml(todayMessage.ritual)}</p>
        <button class="ritual-button ${derived.hasWorkedToday ? "is-finished" : ""}" type="button" data-action="claim-star" ${derived.hasWorkedToday ? "disabled" : ""}>
          ${renderIcon(derived.hasWorkedToday ? "star" : "wand", "button-icon")}
          <span>${derived.hasWorkedToday ? "Today's Star Is Safe" : "I Worked Today"}</span>
        </button>
        <p class="helper-copy">${escapeHtml(activeTabCopy)}</p>
        <div class="progress-box">
          <div class="progress-copy">
            <strong>${escapeHtml(nextUnlock.headline)}</strong>
            <span>${escapeHtml(nextUnlock.detail)}</span>
          </div>
          <div class="progress-bar">
            <span style="width:${nextUnlock.progress}%"></span>
          </div>
        </div>
        ${buildCelebrationCard(runtime.lastClaimOutcome)}
      </article>

      <section class="stat-grid">
        ${renderStatCard("Lifetime", String(derived.totalStars), "Unique worked days only", "star")}
        ${renderStatCard("Current streak", String(derived.currentStreak), derived.currentStreak ? "Still warm" : "Soft reset ready", "streak")}
        ${renderStatCard("Weekly shine", String(derived.weeklyShine), "Last 7 days", "spark")}
        ${renderStatCard("Monthly bloom", String(derived.monthlyBloom), "This month", "calendar")}
      </section>

      <section class="duo-grid">
        <article class="card mini-stage-card">
          <div class="section-heading-row">
            <div>
              <p class="eyebrow">Mascot</p>
              <h3>${escapeHtml(derived.mascotStage.title)}</h3>
            </div>
            ${renderIcon("mascot", "section-icon")}
          </div>
          <p class="helper-copy">${escapeHtml(derived.mascotStage.description)}</p>
          <p class="stage-flourish">${escapeHtml(derived.mascotStage.mood)}</p>
        </article>

        <article class="card mini-stage-card">
          <div class="section-heading-row">
            <div>
              <p class="eyebrow">Room</p>
              <h3>${escapeHtml(derived.roomStage.title)}</h3>
            </div>
            ${renderIcon("room", "section-icon")}
          </div>
          <p class="helper-copy">${escapeHtml(derived.roomStage.description)}</p>
          <p class="stage-flourish">${escapeHtml(syncState.copy)}</p>
        </article>
      </section>

      <article class="card collection-card">
        <div class="section-heading-row">
          <div>
            <p class="eyebrow">Collection</p>
            <h3>Recent Sky Trail</h3>
          </div>
          ${renderIcon("star", "section-icon")}
        </div>
        <div class="star-trail">
          ${
            recentStars.length
              ? recentStars
                  .map((dateString) =>
                    renderStarToken(
                      derived.dateMetaMap[dateString]?.skinId ?? "default",
                      `${formatLongDate(dateString)} • ${STAR_SKINS[derived.dateMetaMap[dateString]?.skinId ?? "default"].name}`,
                      "medium",
                    ),
                  )
                  .join("")
              : `<p class="empty-copy">${escapeHtml(pickMessage(state.settings.tonePack, "empty", "collection-empty"))}</p>`
          }
        </div>
        ${
          state.settings.legacyHeirloomStars
            ? `<p class="helper-copy">${state.settings.legacyHeirloomStars} heirloom prototype stars are displayed cosmetically only. All unlocks derive from real worked dates.</p>`
            : ""
        }
      </article>
    </div>
  `;
}

function buildDayDetail(selectedDate, derived, todayDate) {
  if (!selectedDate) {
    return `
      <div class="detail-empty">
        <p class="eyebrow">Day Detail</p>
        <h3>Pick a day in the sky</h3>
        <p class="helper-copy">Tap any worked date to see the star skin, streak context, and praise note tied to it.</p>
      </div>
    `;
  }

  const isWorked = derived.workedSet.has(selectedDate);

  if (!isWorked) {
    return `
      <div class="detail-empty">
        <p class="eyebrow">${escapeHtml(formatLongDate(selectedDate))}</p>
        <h3>No stored star for this day</h3>
        <p class="helper-copy">${selectedDate === todayDate ? "If you worked today, your ritual button on the Today screen is ready." : "This calendar square stayed quiet, and that is okay."}</p>
      </div>
    `;
  }

  const meta = derived.dateMetaMap[selectedDate];
  const chips = [
    `<span class="mini-chip">${escapeHtml(STAR_SKINS[meta.skinId].name)}</span>`,
    `<span class="mini-chip">Total ${meta.totalAtDate}</span>`,
    `<span class="mini-chip">Streak ${meta.streakAtDate}</span>`,
    meta.isFirstOfMonth ? `<span class="mini-chip">Month opener</span>` : "",
    meta.rareSparkle ? `<span class="mini-chip">Rare sparkle</span>` : "",
    meta.isWeekend ? `<span class="mini-chip">Weekend shine</span>` : `<span class="mini-chip">${escapeHtml(getWeekdayLabel(meta.weekday))}</span>`,
  ]
    .filter(Boolean)
    .join("");

  const category =
    meta.totalAtDate === 1
      ? "milestone"
      : (meta.gapFromPrevious ?? 0) >= 4
        ? "comeback"
        : meta.streakAtDate >= 3
          ? "streak"
          : "claimed";

  return `
    <div class="detail-top">
      ${renderStarToken(meta.skinId, STAR_SKINS[meta.skinId].name, "large")}
      <div>
        <p class="eyebrow">${escapeHtml(formatLongDate(selectedDate))}</p>
        <h3>${escapeHtml(STAR_SKINS[meta.skinId].name)}</h3>
        <p class="helper-copy">${escapeHtml(pickMessage(state.settings.tonePack, category, `${selectedDate}:${category}`))}</p>
      </div>
    </div>
    <div class="chip-row">${chips}</div>
  `;
}

function renderSkyScreen(derived, todayDate) {
  const selectedDate = getSelectedSkyDate(derived, todayDate);
  const calendarCells = buildCalendarCells(state.ui.skyMonth, derived.workedSet, todayDate, selectedDate, derived.dateMetaMap);
  const currentTheme = getThemeForDate(`${state.ui.skyMonth}-01`);
  const ribbonCopy =
    derived.activeMonthTotal > 0
      ? `${derived.activeMonthTotal} worked ${derived.activeMonthTotal === 1 ? "day" : "days"} in this page of the sky.`
      : "No stars placed in this month yet. The calendar page is still open.";

  refs.skyScreen.innerHTML = `
    <div class="screen-column">
      <article class="card month-card">
        <div class="month-nav">
          <button class="month-button" type="button" data-action="change-month" data-direction="-1" aria-label="Previous month">
            <span>&lt;</span>
          </button>
          <div class="month-copy">
            <p class="eyebrow">Sky Archive</p>
            <h2>${escapeHtml(getMonthLabel(state.ui.skyMonth))}</h2>
            <p>${escapeHtml(ribbonCopy)}</p>
            <span class="pill">${escapeHtml(currentTheme.motif)}</span>
          </div>
          <button class="month-button" type="button" data-action="change-month" data-direction="1" aria-label="Next month">
            <span>&gt;</span>
          </button>
        </div>
      </article>

      <article class="card calendar-card">
        <div class="weekday-row">
          ${[0, 1, 2, 3, 4, 5, 6].map((weekday) => `<span>${getWeekdayLabel(weekday)}</span>`).join("")}
        </div>
        <div class="calendar-grid">
          ${calendarCells
            .map((cell) => {
              if (cell.isBlank) {
                return `<span class="calendar-cell is-blank"></span>`;
              }

              const classes = [
                "calendar-cell",
                cell.isWorked ? "is-worked" : "",
                cell.isToday ? "is-today" : "",
                cell.isSelected ? "is-selected" : "",
              ]
                .filter(Boolean)
                .join(" ");

              return `
                <button class="${classes}" type="button" data-action="select-date" data-date="${cell.dateString}">
                  <span class="calendar-day">${cell.label}</span>
                  ${cell.isWorked ? renderStarToken(cell.meta?.skinId ?? "default", formatLongDate(cell.dateString), "small") : `<span class="calendar-dust"></span>`}
                </button>
              `;
            })
            .join("")}
        </div>
      </article>

      <article class="card detail-card">
        ${buildDayDetail(selectedDate, derived, todayDate)}
      </article>

      <article class="card constellation-card">
        <div class="section-heading-row">
          <div>
            <p class="eyebrow">Constellation Summary</p>
            <h3>Derived from your worked dates</h3>
          </div>
          ${renderIcon("moon", "section-icon")}
        </div>
        <div class="chip-row">
          <span class="mini-chip">Current streak ${derived.currentStreak}</span>
          <span class="mini-chip">Best run ${derived.bestStreak}</span>
          <span class="mini-chip">Weekly shine ${derived.weeklyShine}</span>
          <span class="mini-chip">Monthly bloom ${derived.monthlyBloom}</span>
        </div>
        <p class="helper-copy">The sky view stays calendar-first for clarity, but every worked day still gets a collectible skin and little story context.</p>
      </article>
    </div>
  `;
}

function getSkinUnlockState(derived, skinId) {
  switch (skinId) {
    case "default":
      return { unlocked: true, copy: "Always available for ordinary worked days." };
    case "heart":
      return { unlocked: derived.totalStars >= 5, copy: "Appears on every fifth total star." };
    case "crown":
      return { unlocked: derived.totalStars >= 10, copy: "Appears on every tenth total star." };
    case "ribbon":
      return {
        unlocked: derived.sortedDates.some((dateString) => derived.dateMetaMap[dateString]?.isFirstOfMonth),
        copy: "Used on the first worked day of any month.",
      };
    case "moon":
      return { unlocked: derived.bestStreak >= 7, copy: "Shows up when your streak moments become moonworthy." };
    case "comet":
      return {
        unlocked: derived.sortedDates.some((dateString) => derived.dateMetaMap[dateString]?.rareSparkle),
        copy: "Rare deterministic dates bloom into comet stars.",
      };
    case "blossom":
      return { unlocked: derived.totalStars >= 3, copy: "Seasonal blossom finish begins after your first tiny cluster." };
    default:
      return { unlocked: false, copy: "" };
  }
}

function renderRewardsScreen(derived) {
  const currentTitleIndex = TITLE_STAGES.findIndex((stage) => stage.title === derived.activeTitle.title);
  const nextTitleThreshold = derived.nextTitle?.threshold ?? derived.totalStars;
  const currentTitleThreshold = TITLE_STAGES[currentTitleIndex]?.threshold ?? 0;
  const nextTitleProgress = derived.nextTitle
    ? Math.round(((derived.totalStars - currentTitleThreshold) / Math.max(1, nextTitleThreshold - currentTitleThreshold)) * 100)
    : 100;

  refs.rewardsScreen.innerHTML = `
    <div class="screen-column">
      <article class="card reward-hero">
        <p class="eyebrow">Title Progression</p>
        <h2>${escapeHtml(derived.activeTitle.title)}</h2>
        <p class="helper-copy">
          ${
            derived.nextTitle
              ? `${derived.nextTitle.threshold - derived.totalStars} more stars to unlock ${derived.nextTitle.title}.`
              : "Every title tier is unlocked."
          }
        </p>
        <div class="progress-bar">
          <span style="width:${nextTitleProgress}%"></span>
        </div>
      </article>

      <article class="card ladder-card">
        <div class="section-heading-row">
          <div>
            <p class="eyebrow">Reward Ladder</p>
            <h3>Every few stars, something cute opens</h3>
          </div>
          ${renderIcon("gift", "section-icon")}
        </div>
        <div class="reward-list">
          ${REWARD_LADDER.map((reward) => {
            const unlocked = derived.rewardIdSet.has(reward.id);
            return `
              <article class="reward-item ${unlocked ? "is-unlocked" : "is-locked"}">
                <div class="reward-threshold">${reward.threshold}</div>
                <div class="reward-copy">
                  <strong>${escapeHtml(reward.title)}</strong>
                  <p>${escapeHtml(reward.description)}</p>
                </div>
                <span class="reward-state">${unlocked ? "Unlocked" : "Locked"}</span>
              </article>
            `;
          }).join("")}
        </div>
      </article>

      <section class="duo-grid">
        <article class="card mini-stage-card">
          <div class="section-heading-row">
            <div>
              <p class="eyebrow">Mascot Evolution</p>
              <h3>${escapeHtml(derived.mascotStage.title)}</h3>
            </div>
            ${renderIcon("mascot", "section-icon")}
          </div>
          <p class="helper-copy">${escapeHtml(derived.mascotStage.description)}</p>
          <div class="stage-track">
            ${MASCOT_STAGES.map((stage) => `<span class="mini-chip ${derived.totalStars >= stage.threshold ? "is-reached" : ""}">${escapeHtml(stage.title)}</span>`).join("")}
          </div>
        </article>

        <article class="card mini-stage-card">
          <div class="section-heading-row">
            <div>
              <p class="eyebrow">Room Upgrades</p>
              <h3>${escapeHtml(derived.roomStage.title)}</h3>
            </div>
            ${renderIcon("room", "section-icon")}
          </div>
          <p class="helper-copy">${escapeHtml(derived.roomStage.description)}</p>
          <div class="stage-track">
            ${ROOM_STAGES.map((stage) => `<span class="mini-chip ${derived.totalStars >= stage.threshold ? "is-reached" : ""}">${stage.threshold}</span>`).join("")}
          </div>
        </article>
      </section>

      <article class="card skin-card">
        <div class="section-heading-row">
          <div>
            <p class="eyebrow">Star Skins</p>
            <h3>Collection variety from one data point</h3>
          </div>
          ${renderIcon("star", "section-icon")}
        </div>
        <div class="skin-grid">
          ${Object.values(STAR_SKINS)
            .map((skin) => {
              const unlockState = getSkinUnlockState(derived, skin.id);
              return `
                <article class="skin-item ${unlockState.unlocked ? "is-unlocked" : "is-locked"}">
                  ${renderStarToken(skin.id, skin.name, "medium")}
                  <strong>${escapeHtml(skin.name)}</strong>
                  <p>${escapeHtml(unlockState.copy)}</p>
                </article>
              `;
            })
            .join("")}
        </div>
      </article>

      <article class="card badge-shelf">
        <div class="section-heading-row">
          <div>
            <p class="eyebrow">Badge Shelf</p>
            <h3>${derived.unlockedBadges.length} of ${BADGES.length} unlocked</h3>
          </div>
          ${renderIcon("crown", "section-icon")}
        </div>
        <div class="badge-grid">
          ${BADGES.map((badge) => {
            const unlocked = derived.badgeIdSet.has(badge.id);
            return `
              <article class="badge-card ${unlocked ? "is-unlocked" : "is-locked"}">
                ${renderBadgeGlyph(badge.icon)}
                <strong>${escapeHtml(badge.title)}</strong>
                <p>${escapeHtml(badge.description)}</p>
              </article>
            `;
          }).join("")}
        </div>
      </article>
    </div>
  `;
}

function renderNotesScreen(derived, todayDate) {
  const journalEntries = derived.recentDates.slice(0, 8);

  refs.notesScreen.innerHTML = `
    <div class="screen-column">
      <article class="card note-hero">
        <p class="eyebrow">Notes and Praise</p>
        <h2>Soft proof, pretty letters</h2>
        <p class="helper-copy">
          Every milestone note is static content unlocked only by total stars. The day-to-day praise cards are derived from your worked dates and selected tone pack.
        </p>
      </article>

      <article class="card love-note-card">
        <div class="section-heading-row">
          <div>
            <p class="eyebrow">Milestone Love Notes</p>
            <h3>${derived.unlockedLoveNotes.length} unlocked</h3>
          </div>
          ${renderIcon("letter", "section-icon")}
        </div>
        <div class="notes-stack">
          ${
            derived.unlockedLoveNotes.length
              ? derived.unlockedLoveNotes
                  .map(
                    (note) => `
                      <article class="note-card">
                        <span class="note-ribbon">Unlocked at ${note.threshold} stars</span>
                        <h3>${escapeHtml(note.title)}</h3>
                        <p>${escapeHtml(note.body)}</p>
                      </article>
                    `,
                  )
                  .join("")
              : `<p class="empty-copy">${escapeHtml(pickMessage(state.settings.tonePack, "empty", "notes-empty"))}</p>`
          }
        </div>
      </article>

      <article class="card journal-card">
        <div class="section-heading-row">
          <div>
            <p class="eyebrow">Praise Journal</p>
            <h3>Recent worked days</h3>
          </div>
          ${renderIcon("spark", "section-icon")}
        </div>
        <div class="journal-list">
          ${
            journalEntries.length
              ? journalEntries
                  .map((dateString) => {
                    const meta = derived.dateMetaMap[dateString];
                    const category =
                      meta.totalAtDate === 1
                        ? "milestone"
                        : (meta.gapFromPrevious ?? 0) >= 4
                          ? "comeback"
                          : meta.streakAtDate >= 3
                            ? "streak"
                            : "claimed";

                    return `
                      <article class="journal-entry">
                        <div class="journal-top">
                          <div class="journal-heading">
                            ${renderStarToken(meta.skinId, STAR_SKINS[meta.skinId].name, "small")}
                            <div>
                              <strong>${escapeHtml(formatLongDate(dateString))}</strong>
                              <span>${escapeHtml(daysAgoLabel(dateString, todayDate))}</span>
                            </div>
                          </div>
                          <span class="mini-chip">#${meta.totalAtDate}</span>
                        </div>
                        <p>${escapeHtml(pickMessage(state.settings.tonePack, category, `${dateString}:${category}:journal`))}</p>
                      </article>
                    `;
                  })
                  .join("")
              : `<p class="empty-copy">Once you start collecting stars, this page turns into a little praise scrapbook.</p>`
          }
        </div>
      </article>
    </div>
  `;
}

function renderStatusBanner(syncState, theme) {
  refs.statusBanner.innerHTML = `
    <div class="status-card status-${escapeHtml(syncState.kind)}">
      <div class="status-left">
        ${renderIcon(syncState.kind === "warning" ? "spark" : syncState.kind === "good" ? "star" : "calendar", "status-icon")}
        <div>
          <strong>${escapeHtml(syncState.label)}</strong>
          <p>${escapeHtml(syncState.copy)}</p>
        </div>
      </div>
      <span class="status-theme">${escapeHtml(theme.name)}</span>
    </div>
  `;
}

function renderNav() {
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === state.ui.activeTab);
  });

  document.querySelectorAll(".screen").forEach((screen) => {
    screen.classList.toggle("is-active", screen.dataset.screen === state.ui.activeTab);
  });
}

function renderSettings() {
  const tonePack = getTonePack(state.settings.tonePack);
  const syncState = getSyncState();

  refs.settingsForm.elements.nickname.value = state.settings.nickname;
  refs.settingsForm.elements.title.value = state.settings.title;
  refs.settingsForm.elements.tonePack.value = state.settings.tonePack;
  refs.settingsForm.elements.timeZone.value = state.settings.timeZone;
  refs.settingsForm.elements.motion.value = state.settings.motion;
  refs.settingsForm.elements.sound.checked = Boolean(state.settings.sound);
  refs.settingsForm.elements.reminderTime.value = state.settings.reminderTime;
  refs.settingsForm.elements.supabaseUrl.value = state.settings.supabaseUrl;
  refs.settingsForm.elements.supabaseAnonKey.value = state.settings.supabaseAnonKey;
  refs.settingsForm.elements.authEmail.value = state.settings.authEmail;

  refs.tonePreview.textContent = tonePack.preview;
  refs.syncStatusCopy.textContent = syncState.copy;

  refs.magicLinkButton.disabled = runtime.syncBusy;
  refs.signOutButton.hidden = !supabaseState.user;
  refs.magicLinkButton.textContent = runtime.syncBusy ? "Working..." : "Send Magic Link";

  refs.settingsBackdrop.hidden = !runtime.settingsOpen;
  refs.settingsSheet.classList.toggle("is-open", runtime.settingsOpen);
  refs.settingsSheet.setAttribute("aria-hidden", runtime.settingsOpen ? "false" : "true");
}

function render() {
  const todayDate = getTodayDate();

  if (!state.ui.skyMonth) {
    state.ui.skyMonth = getCurrentMonthKey(state.settings.timeZone);
  }

  const derived = deriveAll(state.workedDates, todayDate, state.ui.skyMonth);
  const theme = applyTheme(todayDate);
  const syncState = getSyncState();

  renderStatusBanner(syncState, theme);
  renderTodayScreen(derived, theme, todayDate, syncState);
  renderSkyScreen(derived, todayDate);
  renderRewardsScreen(derived);
  renderNotesScreen(derived, todayDate);
  renderNav();
  renderSettings();

  if (runtime.isBooting) {
    runtime.isBooting = false;
    refs.loadingCurtain.classList.add("is-hidden");
  }
}

function populateTonePackOptions() {
  refs.tonePackSelect.innerHTML = TONE_PACKS.map(
    (tonePack) => `<option value="${tonePack.id}">${escapeHtml(tonePack.name)}</option>`,
  ).join("");
}

function populateTimeZoneList() {
  const fallbackZones = [
    state.settings.timeZone || getDefaultTimeZone(),
    "UTC",
    "Africa/Cairo",
    "America/New_York",
    "America/Los_Angeles",
    "Europe/London",
  ];

  const availableTimeZones = typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : fallbackZones;

  refs.timezoneList.innerHTML = [...new Set(availableTimeZones)].map((timeZone) => `<option value="${escapeHtml(timeZone)}"></option>`).join("");
}

function setActiveTab(tab) {
  state.ui.activeTab = tab;
  saveAndRender();
}

function openSettings() {
  runtime.settingsOpen = true;
  renderSettings();
}

function closeSettings() {
  runtime.settingsOpen = false;
  renderSettings();
}

function buildReminderFile() {
  const [year, month, day] = getTodayDate().split("-").map(Number);
  const [hourText, minuteText] = (state.settings.reminderTime || "20:30").split(":");
  const startDate = new Date(Date.UTC(year, month - 1, day, Number(hourText), Number(minuteText)));
  const endDate = new Date(startDate.getTime() + 10 * 60 * 1000);
  const formatCalendarDate = (date) =>
    `${String(date.getUTCFullYear()).padStart(4, "0")}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
  const formatClock = (date) =>
    `${String(date.getUTCHours()).padStart(2, "0")}${String(date.getUTCMinutes()).padStart(2, "0")}00`;
  const reminderDate = formatCalendarDate(startDate);
  const endDateString = formatCalendarDate(endDate);

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Maryoma Stars//EN",
    "BEGIN:VEVENT",
    `UID:maryoma-stars-reminder-${reminderDate}@maryoma-stars`,
    `DTSTAMP:${reminderDate}T000000Z`,
    `DTSTART:${reminderDate}T${formatClock(startDate)}`,
    `DTEND:${endDateString}T${formatClock(endDate)}`,
    "RRULE:FREQ=DAILY",
    "SUMMARY:Maryoma Stars ritual",
    "DESCRIPTION:Open the shrine and collect today's star if you worked.",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function downloadFile(filename, contents, type) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function syncWithSupabase() {
  if (!supabaseState.user || !supabaseState.manager?.available || runtime.syncBusy) {
    return;
  }

  runtime.syncBusy = true;
  renderSettings();
  render();

  try {
    const localDates = mergeDates(state.workedDates, state.pendingClaims);

    if (localDates.length) {
      const syncResult = await supabaseState.manager.syncWorkedDays(localDates, supabaseState.user.id);
      if (syncResult.error) {
        throw syncResult.error;
      }
    }

    const remoteResult = await supabaseState.manager.fetchWorkedDays();

    if (remoteResult.error) {
      throw remoteResult.error;
    }

    state.workedDates = mergeDates(localDates, remoteResult.dates);
    state.pendingClaims = [];
    state.sync.lastSyncAt = new Date().toISOString();
    state.sync.lastError = "";
    saveState(state);
  } catch (error) {
    state.sync.lastError = error?.message || "Could not sync right now.";
    saveState(state);
  } finally {
    runtime.syncBusy = false;
    render();
  }
}

async function initializeSupabase() {
  const hasConfig = Boolean(state.settings.supabaseUrl && state.settings.supabaseAnonKey);

  if (supabaseState.unsubscribe) {
    supabaseState.unsubscribe();
    supabaseState.unsubscribe = null;
  }

  if (!hasConfig) {
    supabaseState.manager = null;
    supabaseState.available = false;
    supabaseState.user = null;
    runtime.supabaseReady = true;
    render();
    return;
  }

  try {
    const manager = await createSupabaseManager({
      supabaseUrl: state.settings.supabaseUrl,
      supabaseAnonKey: state.settings.supabaseAnonKey,
    });

    if (!manager.available) {
      supabaseState.manager = null;
      supabaseState.available = false;
      supabaseState.user = null;
      runtime.supabaseReady = true;
      render();
      return;
    }

    supabaseState.manager = manager;
    supabaseState.available = true;

    const sessionState = await manager.getSession();
    supabaseState.user = sessionState.user;

    if (sessionState.error) {
      state.sync.lastError = sessionState.error.message;
    }

    supabaseState.unsubscribe = manager.onAuthStateChange(({ event, user }) => {
      supabaseState.user = user;

      if (event === "SIGNED_OUT") {
        state.sync.lastError = "";
      }

      setTimeout(() => {
        if (supabaseState.user) {
          syncWithSupabase();
        } else {
          render();
        }
      }, 0);
    });

    runtime.supabaseReady = true;

    if (supabaseState.user) {
      await syncWithSupabase();
    }
  } catch (error) {
    supabaseState.manager = null;
    supabaseState.available = false;
    supabaseState.user = null;
    state.sync.lastError = error?.message || "Supabase could not wake up.";
    saveState(state);
    render();
  }
}

function launchCelebration(outcome) {
  if (!getMotionEnabled()) {
    return;
  }

  refs.celebrationLayer.innerHTML = "";
  refs.celebrationLayer.classList.add("is-active");
  const particleCount = outcome.grandCeremony ? 20 : 12;

  for (let index = 0; index < particleCount; index += 1) {
    const particle = document.createElement("span");
    particle.className = "celebration-particle";
    particle.style.setProperty("--tx", `${(Math.random() - 0.5) * 280}px`);
    particle.style.setProperty("--ty", `${-80 - Math.random() * 180}px`);
    particle.style.setProperty("--delay", `${Math.random() * 100}ms`);
    particle.innerHTML = renderStarToken(outcome.claimMeta?.skinId || "default", "Claimed star", "small");
    refs.celebrationLayer.appendChild(particle);
  }

  window.setTimeout(() => {
    refs.celebrationLayer.classList.remove("is-active");
    refs.celebrationLayer.innerHTML = "";
  }, 1800);
}

function playClaimFeedback(outcome) {
  if (navigator.vibrate) {
    navigator.vibrate(outcome.grandCeremony ? [24, 40, 24] : [18]);
  }

  if (!state.settings.sound) {
    return;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) {
    return;
  }

  const audioContext = new AudioContextClass();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(outcome.grandCeremony ? 720 : 560, audioContext.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(outcome.grandCeremony ? 1080 : 880, audioContext.currentTime + 0.18);
  gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.05, audioContext.currentTime + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.28);
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.3);
}

async function claimToday() {
  const todayDate = getTodayDate();
  const previousDerived = deriveAll(state.workedDates, todayDate, state.ui.skyMonth);

  if (previousDerived.hasWorkedToday) {
    return;
  }

  state.workedDates = mergeDates(state.workedDates, [todayDate]);
  state.ui.skyMonth = todayDate.slice(0, 7);
  state.ui.selectedSkyDate = todayDate;

  if (supabaseState.user) {
    if (!navigator.onLine) {
      state.pendingClaims = mergeDates(state.pendingClaims, [todayDate]);
    } else {
      const syncResult = await supabaseState.manager.syncWorkedDay(todayDate, supabaseState.user.id);

      if (syncResult.error) {
        state.pendingClaims = mergeDates(state.pendingClaims, [todayDate]);
        state.sync.lastError = syncResult.error.message || "Saved locally and queued for sync.";
      } else {
        state.sync.lastError = "";
      }
    }
  }

  saveState(state);

  const nextDerived = deriveAll(state.workedDates, todayDate, state.ui.skyMonth);
  runtime.lastClaimOutcome = deriveClaimOutcome(previousDerived, nextDerived, todayDate);
  launchCelebration(runtime.lastClaimOutcome);
  playClaimFeedback(runtime.lastClaimOutcome);
  render();
  showToast(`Star claimed for ${formatLongDate(todayDate)}.`);

  if (supabaseState.user && navigator.onLine) {
    syncWithSupabase();
  }
}

async function sendMagicLink() {
  if (!state.settings.authEmail) {
    showToast("Add your email first so the shrine knows where to send the link.");
    return;
  }

  if (!state.settings.supabaseUrl || !state.settings.supabaseAnonKey) {
    showToast("Add your Supabase URL and anon key in settings first.");
    return;
  }

  await initializeSupabase();

  if (!supabaseState.manager?.available) {
    showToast("Supabase is not ready yet. Check the settings and try again.");
    return;
  }

  runtime.syncBusy = true;
  renderSettings();

  try {
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const result = await supabaseState.manager.sendMagicLink(state.settings.authEmail, redirectTo);

    if (result.error) {
      throw result.error;
    }

    state.sync.emailSentAt = new Date().toISOString();
    state.sync.lastError = "";
    saveState(state);
    showToast("Magic link sent. Check your inbox, then come right back here.");
  } catch (error) {
    state.sync.lastError = error?.message || "The magic link could not be sent.";
    saveState(state);
    showToast(state.sync.lastError);
  } finally {
    runtime.syncBusy = false;
    render();
  }
}

async function signOut() {
  if (!supabaseState.manager?.available) {
    return;
  }

  const result = await supabaseState.manager.signOut();

  if (result.error) {
    state.sync.lastError = result.error.message || "Could not sign out.";
    saveState(state);
    render();
    return;
  }

  supabaseState.user = null;
  state.sync.lastError = "";
  saveState(state);
  render();
  showToast("Signed out. Local mode is still here for you.");
}

async function handleImportFile(file) {
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const imported = JSON.parse(text);
    state = mergeImportedBackup(state, imported);
    saveAndRender();
    showToast("Backup imported into the shrine.");

    if (supabaseState.user && navigator.onLine) {
      syncWithSupabase();
    }
  } catch (error) {
    showToast(error?.message || "That backup file did not look right.");
  } finally {
    refs.backupInput.value = "";
  }
}

function handleSettingsChange(event) {
  const fieldName = event.target.name;

  if (!fieldName) {
    return;
  }

  switch (fieldName) {
    case "nickname":
    case "title":
    case "tonePack":
    case "motion":
    case "reminderTime":
    case "supabaseUrl":
    case "supabaseAnonKey":
    case "authEmail":
      state.settings[fieldName] = event.target.value.trim();
      break;
    case "timeZone":
      state.settings.timeZone = normalizeTimeZone(event.target.value.trim());
      break;
    case "sound":
      state.settings.sound = event.target.checked;
      break;
    default:
      return;
  }

  if (fieldName === "timeZone") {
    state.ui.skyMonth = getCurrentMonthKey(state.settings.timeZone);
    state.ui.selectedSkyDate = "";
  }

  saveAndRender();
}

function handleDocumentClick(event) {
  const trigger = event.target.closest("[data-action], [data-tab]");

  if (!trigger) {
    return;
  }

  if (trigger.dataset.tab) {
    setActiveTab(trigger.dataset.tab);
    return;
  }

  const { action } = trigger.dataset;

  switch (action) {
    case "open-settings":
      openSettings();
      break;
    case "close-settings":
      closeSettings();
      break;
    case "claim-star":
      claimToday();
      break;
    case "change-month":
      state.ui.skyMonth = shiftMonth(state.ui.skyMonth, Number(trigger.dataset.direction));
      state.ui.selectedSkyDate = "";
      saveAndRender();
      break;
    case "select-date":
      state.ui.selectedSkyDate = trigger.dataset.date;
      saveAndRender();
      break;
    case "download-reminder":
      downloadFile("maryoma-stars-reminder.ics", buildReminderFile(), "text/calendar");
      showToast("Daily reminder file downloaded.");
      break;
    case "download-backup":
      downloadFile(
        `maryoma-stars-backup-${getTodayDate()}.json`,
        JSON.stringify(createBackupPayload(state), null, 2),
        "application/json",
      );
      showToast("Backup exported.");
      break;
    case "import-backup":
      refs.backupInput.click();
      break;
    case "send-magic-link":
      sendMagicLink();
      break;
    case "sign-out":
      signOut();
      break;
    default:
      break;
  }
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  try {
    await navigator.serviceWorker.register("./service-worker.js");
    runtime.serviceWorkerReady = true;
  } catch (error) {
    console.warn("Service worker registration failed.", error);
  }
}

function attachEventListeners() {
  document.addEventListener("click", handleDocumentClick);
  refs.settingsBackdrop.addEventListener("click", closeSettings);
  refs.settingsForm.addEventListener("change", handleSettingsChange);
  refs.backupInput.addEventListener("change", (event) => {
    const [file] = event.target.files;
    handleImportFile(file);
  });
  window.addEventListener("online", () => {
    showToast("Back online. The shrine will try syncing any queued stars.");
    syncWithSupabase();
    render();
  });
  window.addEventListener("offline", () => {
    showToast("Offline mode is okay. New stars stay safe locally.");
    render();
  });
}

async function init() {
  populateTonePackOptions();
  populateTimeZoneList();
  attachEventListeners();
  await registerServiceWorker();
  await initializeSupabase();
  render();
}

init();
