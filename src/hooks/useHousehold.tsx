import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api } from "../lib/api";
import { clearActiveProfileId, loadActiveProfileId, saveActiveProfileId } from "../lib/persona";
import { clearSession, loadSession, saveSession } from "../lib/session";
import type { CreateHouseholdResponse, HouseholdSession, ProfileRow } from "../types";

interface HouseholdApi {
  session: HouseholdSession | null;
  profiles: ProfileRow[];
  activeProfile: ProfileRow | null;
  /** Initial session hydration. */
  loading: boolean;
  /** Auth / profile action in flight. */
  busy: boolean;
  create(profileName: string): Promise<void>;
  /** Adopt an already-created household (credentials screen shown first). */
  adoptCreated(res: CreateHouseholdResponse): void;
  join(displayCode: string, password: string): Promise<void>;
  logout(): void;
  refreshProfiles(): Promise<void>;
  setActiveProfile(profileId: string): void;
  addProfile(name: string): Promise<void>;
}

const HouseholdContext = createContext<HouseholdApi | null>(null);

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<HouseholdSession | null>(null);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const sessionRef = useRef<HouseholdSession | null>(null);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Hydrate session + profiles from localStorage.
  useEffect(() => {
    const s = loadSession();
    if (s) {
      setSession(s);
      setActiveProfileId(loadActiveProfileId(s.householdId));
      void api
        .listProfiles(s.accessToken)
        .then(setProfiles)
        .catch(() => setProfiles([]));
    }
    setLoading(false);
  }, []);

  const activeProfile = useMemo<ProfileRow | null>(() => {
    const found = profiles.find((p) => p.id === activeProfileId);
    return found ?? profiles[0] ?? null;
  }, [profiles, activeProfileId]);

  const setActiveProfile = useCallback((profileId: string) => {
    const s = sessionRef.current;
    if (!s) return;
    saveActiveProfileId(s.householdId, profileId);
    setActiveProfileId(profileId);
  }, []);

  const adoptCreated = useCallback((res: CreateHouseholdResponse) => {
    const s: HouseholdSession = {
      householdId: res.household_id,
      displayCode: res.display_code,
      accessToken: res.access_token,
    };
    saveSession(s);
    setSession(s);
    saveActiveProfileId(res.household_id, res.profile.id);
    setActiveProfileId(res.profile.id);
    setProfiles([{ id: res.profile.id, household_id: res.household_id, name: res.profile.name }]);
  }, []);

  const create = useCallback(async (profileName: string) => {
    setBusy(true);
    try {
      adoptCreated(await api.createHousehold(profileName));
    } finally {
      setBusy(false);
    }
  }, [adoptCreated]);

  const join = useCallback(async (displayCode: string, password: string) => {
    setBusy(true);
    try {
      const res = await api.joinHousehold(displayCode, password);
      const s: HouseholdSession = {
        householdId: res.household_id,
        displayCode: res.display_code,
        accessToken: res.access_token,
      };
      saveSession(s);
      setSession(s);
      setActiveProfileId(loadActiveProfileId(res.household_id));
      void api
        .listProfiles(res.access_token)
        .then(setProfiles)
        .catch(() => setProfiles([]));
    } finally {
      setBusy(false);
    }
  }, []);

  const logout = useCallback(() => {
    const s = sessionRef.current;
    if (s) clearActiveProfileId(s.householdId);
    clearSession();
    setSession(null);
    setProfiles([]);
    setActiveProfileId(null);
  }, []);

  const refreshProfiles = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) {
      setProfiles([]);
      return;
    }
    try {
      setProfiles(await api.listProfiles(s.accessToken));
    } catch {
      setProfiles([]);
    }
  }, []);

  const addProfile = useCallback(
    async (name: string) => {
      const s = sessionRef.current;
      if (!s) return;
      setBusy(true);
      try {
        const p = await api.createProfile(s.accessToken, s.householdId, name);
        setProfiles((prev) => [...prev, p]);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const value = useMemo<HouseholdApi>(
    () => ({
      session,
      profiles,
      activeProfile,
      loading,
      busy,
      create,
      adoptCreated,
      join,
      logout,
      refreshProfiles,
      setActiveProfile,
      addProfile,
    }),
    [session, profiles, activeProfile, loading, busy, create, adoptCreated, join, logout, refreshProfiles, setActiveProfile, addProfile],
  );

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

export function useHousehold(): HouseholdApi {
  const ctx = useContext(HouseholdContext);
  if (!ctx) throw new Error("useHousehold must be used inside <HouseholdProvider>");
  return ctx;
}
