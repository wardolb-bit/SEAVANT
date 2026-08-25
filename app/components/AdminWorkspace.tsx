"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase-client";

interface Props {
  organizationId: string;
  selectedVesselId: string;
  currentUserEmail?: string | null;
}

type Organization = { id: string; name: string };
type VesselRow = { id: string; name: string; imo_number: string | null; call_sign: string | null };
type MemberRow = { user_id: string; role: string };
type VesselMemberRow = { vessel_id: string; user_id: string; role: string };
type ProfileRow = { id: string; full_name: string | null };

type AdminData = {
  organization: Organization | null;
  vessels: VesselRow[];
  members: MemberRow[];
  vesselMembers: VesselMemberRow[];
  profiles: ProfileRow[];
};

const EMPTY: AdminData = { organization: null, vessels: [], members: [], vesselMembers: [], profiles: [] };

export default function AdminWorkspace({ organizationId, selectedVesselId, currentUserEmail }: Props) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [data, setData] = useState<AdminData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [orgResult, vesselResult, memberResult, vesselMemberResult] = await Promise.all([
          supabase.from("organizations").select("id,name").eq("id", organizationId).maybeSingle(),
          supabase.from("vessels").select("id,name,imo_number,call_sign").eq("organization_id", organizationId).order("name"),
          supabase.from("organization_members").select("user_id,role").eq("organization_id", organizationId),
          supabase.from("vessel_members").select("vessel_id,user_id,role")
        ]);
        const firstError = orgResult.error || vesselResult.error || memberResult.error || vesselMemberResult.error;
        if (firstError) throw firstError;

        const members = (memberResult.data ?? []) as MemberRow[];
        const ids = Array.from(new Set(members.map((item) => item.user_id)));
        let profiles: ProfileRow[] = [];
        if (ids.length) {
          const profileResult = await supabase.from("profiles").select("id,full_name").in("id", ids);
          if (profileResult.error) throw profileResult.error;
          profiles = (profileResult.data ?? []) as ProfileRow[];
        }

        if (!alive) return;
        setData({
          organization: orgResult.data as Organization | null,
          vessels: (vesselResult.data ?? []) as VesselRow[],
          members,
          vesselMembers: (vesselMemberResult.data ?? []) as VesselMemberRow[],
          profiles
        });
      } catch (cause) {
        if (!alive) return;
        setError(cause instanceof Error ? cause.message : "Unable to load administration data.");
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => { alive = false; };
  }, [organizationId, supabase]);

  const profileName = (userId: string) => data.profiles.find((p) => p.id === userId)?.full_name?.trim() || "SEAVANT USER";
  const vesselMemberCount = (vesselId: string) => data.vesselMembers.filter((m) => m.vessel_id === vesselId).length;
  const vesselRole = (vesselId: string, userId: string) => data.vesselMembers.find((m) => m.vessel_id === vesselId && m.user_id === userId)?.role;

  if (loading) return <section className="panel workspaceShell"><div className="eyebrow">ADMIN</div><h2>Loading fleet administration…</h2></section>;

  return <section className="adminWorkspace">
    <article className="panel adminHero">
      <div>
        <div className="eyebrow">FLEET ADMINISTRATION</div>
        <h2>{data.organization?.name ?? "SEAVANT ORGANIZATION"}</h2>
        <p>Organization, vessel, and access overview. This first admin pass is intentionally read-only.</p>
      </div>
      <div className="adminModeBadge">READ ONLY · ALPHA</div>
    </article>

    {error && <article className="panel adminError">{error}</article>}

    <div className="adminSummaryGrid">
      <AdminMetric label="VESSELS" value={String(data.vessels.length)} />
      <AdminMetric label="ORG USERS" value={String(data.members.length)} />
      <AdminMetric label="VESSEL ASSIGNMENTS" value={String(data.vesselMembers.length)} />
      <AdminMetric label="ACTIVE VESSEL" value={data.vessels.find((v) => v.id === selectedVesselId)?.name ?? "--"} />
    </div>

    <div className="adminGrid">
      <article className="panel adminPanel">
        <div className="adminPanelHeader"><div><div className="sectionTitle">FLEET</div><p>Vessels currently attached to this organization.</p></div><button className="secondaryAction compactAction" disabled>+ ADD VESSEL</button></div>
        <div className="adminList">
          {data.vessels.map((vessel) => <div className={`adminRow ${vessel.id === selectedVesselId ? "selected" : ""}`} key={vessel.id}>
            <div><strong>{vessel.name}</strong><span>{vessel.imo_number ? `IMO ${vessel.imo_number}` : "IMO NOT SET"} · {vessel.call_sign ? `CALL ${vessel.call_sign}` : "CALL SIGN NOT SET"}</span></div>
            <div className="adminRowMeta"><strong>{vesselMemberCount(vessel.id)}</strong><span>USERS</span></div>
          </div>)}
          {!data.vessels.length && <div className="emptyState">No vessels available.</div>}
        </div>
      </article>

      <article className="panel adminPanel">
        <div className="adminPanelHeader"><div><div className="sectionTitle">PEOPLE & ACCESS</div><p>Organization roles and vessel assignments.</p></div><button className="secondaryAction compactAction" disabled>INVITE USER</button></div>
        <div className="adminList">
          {data.members.map((member, index) => {
            const assignments = data.vessels
              .map((v) => ({ vessel: v, role: vesselRole(v.id, member.user_id) }))
              .filter((item) => item.role);
            return <div className="adminAccessRow" key={member.user_id}>
              <div className="adminAvatar">{profileName(member.user_id).slice(0, 2).toUpperCase()}</div>
              <div className="adminAccessIdentity"><strong>{profileName(member.user_id)}</strong><span>{index === 0 && currentUserEmail ? currentUserEmail : "ACCOUNT"}</span></div>
              <div className="adminRole"><span>ORG</span><strong>{member.role.toUpperCase()}</strong></div>
              <div className="adminAssignments">{assignments.length ? assignments.map((item) => <span key={item.vessel.id}>{item.vessel.name} · {item.role!.toUpperCase()}</span>) : <span>NO VESSEL ASSIGNMENT</span>}</div>
            </div>;
          })}
          {!data.members.length && <div className="emptyState">No organization users found.</div>}
        </div>
      </article>
    </div>

    <article className="panel adminRoadmap">
      <div className="sectionTitle">ADMIN ROADMAP</div>
      <div className="adminRoadmapGrid"><div><strong>01</strong><span>Invite users and assign roles</span></div><div><strong>02</strong><span>Edit vessel particulars</span></div><div><strong>03</strong><span>Manage integrations and AIS endpoints</span></div><div><strong>04</strong><span>Audit trail and permission history</span></div></div>
    </article>
  </section>;
}

function AdminMetric({ label, value }: { label: string; value: string }) {
  return <article className="panel adminMetric"><span>{label}</span><strong>{value}</strong></article>;
}
