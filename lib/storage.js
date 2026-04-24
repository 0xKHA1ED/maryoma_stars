import { getCurrentMonthKey, getDefaultTimeZone, uniqueDateStrings } from "./date.js";

export const APP_STORAGE_KEY = "maryoma-stars-state-v1";
export const LEGACY_STORAGE_KEY = "good_girl_tracker_dates";

export const DEFAULT_SETTINGS = {
  nickname: "Little Star",
  title: "Starling",
  tonePack: "sweet",
  timeZone: getDefaultTimeZone(),
  motion: "system",
  sound: true,
  reminderTime: "20:30",
  supabaseUrl: "",
  supabaseAnonKey: "",
  authEmail: "",
  legacyHeirloomStars: 0,
};

export const DEFAULT_STATE = {
  version: 1,
  workedDates: [],
  pendingClaims: [],
  ui: {
    activeTab: "today",
    skyMonth: "",
    selectedSkyDate: "",
  },
  sync: {
    lastSyncAt: "",
    lastError: "",
    emailSentAt: "",
  },
  meta: {
    prototypeMigrated: false,
  },
  settings: DEFAULT_SETTINGS,
};

function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function safeParse(value) {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn("Could not parse stored state.", error);
    return null;
  }
}

function normalizeState(state) {
  const normalized = {
    ...cloneDefaults(),
    ...state,
    ui: {
      ...cloneDefaults().ui,
      ...(state?.ui ?? {}),
    },
    sync: {
      ...cloneDefaults().sync,
      ...(state?.sync ?? {}),
    },
    meta: {
      ...cloneDefaults().meta,
      ...(state?.meta ?? {}),
    },
    settings: {
      ...DEFAULT_SETTINGS,
      ...(state?.settings ?? {}),
    },
  };

  normalized.workedDates = uniqueDateStrings(normalized.workedDates ?? []);
  normalized.pendingClaims = uniqueDateStrings(normalized.pendingClaims ?? []);

  if (!normalized.ui.skyMonth) {
    normalized.ui.skyMonth = getCurrentMonthKey(normalized.settings.timeZone);
  }

  return normalized;
}

function mergeConfigIntoState(state, config = {}) {
  if (config.supabaseUrl && !state.settings.supabaseUrl) {
    state.settings.supabaseUrl = config.supabaseUrl;
  }

  if (config.supabaseAnonKey && !state.settings.supabaseAnonKey) {
    state.settings.supabaseAnonKey = config.supabaseAnonKey;
  }

  if (config.defaultEmail && !state.settings.authEmail) {
    state.settings.authEmail = config.defaultEmail;
  }

  if (config.timeZone && !state.settings.timeZone) {
    state.settings.timeZone = config.timeZone;
  }

  return state;
}

function migrateLegacyPrototype(state) {
  if (state.meta.prototypeMigrated) {
    return state;
  }

  const legacyDates = safeParse(window.localStorage.getItem(LEGACY_STORAGE_KEY));

  if (Array.isArray(legacyDates) && legacyDates.length > 0) {
    state.workedDates = uniqueDateStrings([...state.workedDates, ...legacyDates]);

    if (!state.settings.legacyHeirloomStars) {
      state.settings.legacyHeirloomStars = 4;
    }
  }

  state.meta.prototypeMigrated = true;
  return state;
}

export function loadState(config = {}) {
  const storedState = safeParse(window.localStorage.getItem(APP_STORAGE_KEY));
  const normalizedState = normalizeState(storedState ?? cloneDefaults());
  mergeConfigIntoState(normalizedState, config);
  migrateLegacyPrototype(normalizedState);
  return normalizeState(normalizedState);
}

export function saveState(state) {
  const normalizedState = normalizeState(state);
  window.localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(normalizedState));
  return normalizedState;
}

export function mergeDates(existingDates, incomingDates) {
  return uniqueDateStrings([...(existingDates ?? []), ...(incomingDates ?? [])]);
}

export function createBackupPayload(state) {
  return {
    backupType: "maryoma-stars-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    workedDates: uniqueDateStrings(state.workedDates ?? []),
    pendingClaims: uniqueDateStrings(state.pendingClaims ?? []),
    settings: {
      nickname: state.settings.nickname,
      title: state.settings.title,
      tonePack: state.settings.tonePack,
      timeZone: state.settings.timeZone,
      motion: state.settings.motion,
      sound: state.settings.sound,
      reminderTime: state.settings.reminderTime,
      legacyHeirloomStars: state.settings.legacyHeirloomStars,
      supabaseUrl: state.settings.supabaseUrl,
      supabaseAnonKey: state.settings.supabaseAnonKey,
      authEmail: state.settings.authEmail,
    },
  };
}

export function mergeImportedBackup(state, importedPayload) {
  if (!importedPayload || importedPayload.backupType !== "maryoma-stars-backup") {
    throw new Error("That file is not a Maryoma Stars backup.");
  }

  const nextState = normalizeState({
    ...state,
    workedDates: mergeDates(state.workedDates, importedPayload.workedDates ?? []),
    pendingClaims: mergeDates(state.pendingClaims, importedPayload.pendingClaims ?? []),
    settings: {
      ...state.settings,
      ...(importedPayload.settings ?? {}),
    },
  });

  return nextState;
}
