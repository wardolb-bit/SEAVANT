"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase-client";

export interface VesselIdentity {
  id: string;
  name: string;
  organization_id: string;
}

interface IdentityGateProps {
  children: (identity: {
    user: User;
    vessel: VesselIdentity;
    vessels: VesselIdentity[];
    selectVessel: (id: string) => void;
    signOut: () => Promise<void>;
  }) => ReactNode;
}

type Mode = "login" | "signup";

export default function IdentityGate({ children }: IdentityGateProps) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [vessels, setVessels] = useState<VesselIdentity[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [mode, setMode] = useState<Mode>("login");
  const [message, setMessage] = useState("");

  const loadVessels = useCallback(async (currentUser: User) => {
    const { data, error } = await supabase
      .from("vessels")
      .select("id,name,organization_id")
      .order("name");

    if (error) throw error;
    const available = (data ?? []) as VesselIdentity[];
    setVessels(available);
    setNeedsOnboarding(available.length === 0);

    if (available.length) {
      const stored = window.localStorage.getItem(`seavant:vessel:${currentUser.id}`);
      const initial = available.some((v) => v.id === stored) ? stored! : available[0].id;
      setSelectedId(initial);
    }
  }, [supabase]);

  useEffect(() => {
    let alive = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      const currentUser = data.session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        try { await loadVessels(currentUser); }
        catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load vessel access."); }
      }
      if (alive) setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      if (nextUser) void loadVessels(nextUser);
      else {
        setVessels([]);
        setSelectedId(null);
        setNeedsOnboarding(false);
      }
      setLoading(false);
    });

    return () => {
      alive = false;
      subscription.subscription.unsubscribe();
    };
  }, [loadVessels, supabase]);

  function selectVessel(id: string) {
    if (!user) return;
    setSelectedId(id);
    window.localStorage.setItem(`seavant:vessel:${user.id}`, id);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  if (loading) return <GateFrame><div className="gateStatus">INITIALIZING SEAVANT IDENTITY…</div></GateFrame>;
  if (!user) return <AuthForm mode={mode} setMode={setMode} message={message} setMessage={setMessage} />;
  if (needsOnboarding) return <Onboarding user={user} onReady={() => loadVessels(user)} message={message} setMessage={setMessage} />;

  const vessel = vessels.find((item) => item.id === selectedId) ?? vessels[0];
  if (!vessel) return <GateFrame><div className="gateStatus">NO VESSEL ACCESS ASSIGNED</div></GateFrame>;

  return <>{children({ user, vessel, vessels, selectVessel, signOut })}</>;
}

function AuthForm({ mode, setMode, message, setMessage }: {
  mode: Mode;
  setMode: (mode: Mode) => void;
  message: string;
  setMessage: (value: string) => void;
}) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName.trim() },
            emailRedirectTo: window.location.origin
          }
        });
        if (error) throw error;
        if (!data.session) setMessage("Account created. Check your email to confirm your address, then return to SEAVANT.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  return <GateFrame>
    <form className="authPanel panel" onSubmit={submit}>
      <div className="eyebrow">WARD MARITIME</div>
      <h1>SEAVANT</h1>
      <div className="authSubtitle">MARITIME OPERATIONS PLATFORM</div>
      {mode === "signup" && <label>FULL NAME<input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required /></label>}
      <label>EMAIL<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
      <label>PASSWORD<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required /></label>
      {message && <div className="authMessage">{message}</div>}
      <button className="primaryAction" type="submit" disabled={busy}>{busy ? "WORKING…" : mode === "login" ? "SIGN IN" : "CREATE ACCOUNT"}</button>
      <button className="textAction" type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>
        {mode === "login" ? "CREATE A SEAVANT ACCOUNT" : "BACK TO SIGN IN"}
      </button>
    </form>
  </GateFrame>;
}

function Onboarding({ user, onReady, message, setMessage }: {
  user: User;
  onReady: () => Promise<void>;
  message: string;
  setMessage: (value: string) => void;
}) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [organizationName, setOrganizationName] = useState("Ward Maritime");
  const [vesselName, setVesselName] = useState("");
  const [busy, setBusy] = useState(false);

  async function createWorkspace(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const { data: existingOrgs, error: orgLookupError } = await supabase.from("organizations").select("id,name").limit(1);
      if (orgLookupError) throw orgLookupError;

      let organizationId = existingOrgs?.[0]?.id as string | undefined;
      if (!organizationId) {
        const { data: org, error: orgError } = await supabase
          .from("organizations")
          .insert({ name: organizationName.trim(), created_by: user.id })
          .select("id")
          .single();
        if (orgError) throw orgError;
        organizationId = org.id;

        const { error: memberError } = await supabase.from("organization_members").insert({
          organization_id: organizationId,
          user_id: user.id,
          role: "owner"
        });
        if (memberError) throw memberError;
      }

      const { data: vessel, error: vesselError } = await supabase
        .from("vessels")
        .insert({ organization_id: organizationId, name: vesselName.trim(), created_by: user.id })
        .select("id")
        .single();
      if (vesselError) throw vesselError;

      const { error: vesselMemberError } = await supabase.from("vessel_members").insert({
        vessel_id: vessel.id,
        user_id: user.id,
        role: "master"
      });
      if (vesselMemberError) throw vesselMemberError;

      await onReady();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create SEAVANT workspace.");
    } finally {
      setBusy(false);
    }
  }

  return <GateFrame>
    <form className="authPanel panel" onSubmit={createWorkspace}>
      <div className="eyebrow">FIRST RUN</div>
      <h1>SET UP SEAVANT</h1>
      <div className="authSubtitle">Create the first organization and vessel. You will be the owner and vessel master.</div>
      <label>ORGANIZATION<input value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} required /></label>
      <label>VESSEL NAME<input value={vesselName} onChange={(e) => setVesselName(e.target.value)} placeholder="M/V …" required /></label>
      {message && <div className="authMessage">{message}</div>}
      <button className="primaryAction" type="submit" disabled={busy}>{busy ? "CREATING…" : "CREATE WORKSPACE"}</button>
    </form>
  </GateFrame>;
}

function GateFrame({ children }: { children: ReactNode }) {
  return <main className="gateShell">{children}</main>;
}
