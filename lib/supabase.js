import { uniqueDateStrings } from "./date.js";

let cachedClient = null;
let cachedConfigKey = "";
let modulePromise = null;

function getConfigKey(config) {
  return `${config.supabaseUrl || ""}::${config.supabaseAnonKey || ""}`;
}

async function loadSupabaseModule() {
  if (!modulePromise) {
    modulePromise = import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm");
  }

  return modulePromise;
}

async function getClient(config) {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    return null;
  }

  const configKey = getConfigKey(config);

  if (cachedClient && cachedConfigKey === configKey) {
    return cachedClient;
  }

  const { createClient } = await loadSupabaseModule();
  cachedClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  cachedConfigKey = configKey;
  return cachedClient;
}

function toRows(dateStrings, userId) {
  return uniqueDateStrings(dateStrings).map((workedOn) => ({
    user_id: userId,
    worked_on: workedOn,
  }));
}

export async function createSupabaseManager(config) {
  const client = await getClient(config);

  if (!client) {
    return {
      available: false,
      reason: "missing-config",
    };
  }

  return {
    available: true,
    client,
    async getSession() {
      const {
        data: { session },
        error,
      } = await client.auth.getSession();

      return {
        session,
        user: session?.user ?? null,
        error,
      };
    },
    onAuthStateChange(callback) {
      const { data } = client.auth.onAuthStateChange((event, session) => {
        callback({
          event,
          session,
          user: session?.user ?? null,
        });
      });

      return () => data.subscription.unsubscribe();
    },
    async sendMagicLink(email, redirectTo) {
      const { data, error } = await client.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectTo,
        },
      });

      return { data, error };
    },
    async signOut() {
      return client.auth.signOut({ scope: "local" });
    },
    async fetchWorkedDays() {
      const { data, error } = await client
        .from("worked_days")
        .select("worked_on")
        .order("worked_on", { ascending: true });

      return {
        dates: uniqueDateStrings((data ?? []).map((entry) => entry.worked_on)),
        error,
      };
    },
    async syncWorkedDays(dateStrings, userId) {
      const rows = toRows(dateStrings, userId);

      if (!rows.length) {
        return { error: null };
      }

      const { error } = await client
        .from("worked_days")
        .upsert(rows, {
          onConflict: "user_id,worked_on",
          ignoreDuplicates: true,
        });

      return { error };
    },
    async syncWorkedDay(dateString, userId) {
      return this.syncWorkedDays([dateString], userId);
    },
  };
}
