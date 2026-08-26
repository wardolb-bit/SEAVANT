"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase-client";

interface Props {
  organizationId: string;
  selectedVesselId: string;
  currentUserEmail?: string | null;
}

type AccessRole = "admin" | "master" | "officer" | "engineer" | "viewer";
type Organization = { id: string; name: string };
type VesselRow = { id: string; name: string; imo_number: string | null; call_sign: string | null };
type MemberRow = { user_id: string; role: string; active: boolean; invited_at: string | null };
type VesselMemberRow = { vessel_id: string; user_id: string; role: string };
type ProfileRow = { id: string; full_name: string | null; email: string | null };
type AuditRow = { id: string; actor_id: string | null; action: string; summary: string; created_at: string };
type VesselDraft = { name: string; imo_number: string; call_sign: string };
type InviteDraft = { fullName: string; email: string; role: AccessRole; vesselIds: string[] };
type AccessDraft = { userId: string; role: AccessRole; vesselIds: string[] };
type AccountDraft = { userId: string; password: string; confirmation: string; deleteConfirmation: string };

type AdminData = {
  organization: Organization | null;
  vessels: VesselRow[];
  members: MemberRow[];
  vesselMembers: VesselMemberRow[];
  profiles: ProfileRow[];
  auditLogs: AuditRow[];
};

const EMPTY: AdminData = { organization: null, vessels: [], members: [], vesselMembers: [], profiles: [], auditLogs: [] };
const EMPTY_INVITE: InviteDraft = { fullName: "", email: "", role: "officer", vesselIds: [] };
const MANAGER_ROLES = new Set(["owner", "admin"]);
const ROLE_OPTIONS: { value: AccessRole; label: string; detail: string }[] = [
  { value: "admin", label: "ADMIN", detail: "Fleet settings, users, vessels, voyages, and records" },
  { value: "master", label: "MASTER", detail: "Assigned-vessel voyage planning and watch operations" },
  { value: "officer", label: "BRIDGE", detail: "Assigned-vessel voyage planning and watch operations" },
  { value: "engineer", label: "ENGINEERING", detail: "Assigned-vessel operational visibility" },
  { value: "viewer", label: "VIEW ONLY", detail: "Read-only access to assigned vessels" }
];

export default function AdminWorkspace({ organizationId, selectedVesselId, currentUserEmail }: Props) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [data, setData] = useState<AdminData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<VesselDraft>({ name: "", imo_number: "", call_sign: "" });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteDraft, setInviteDraft] = useState<InviteDraft>(EMPTY_INVITE);
  const [accessDraft, setAccessDraft] = useState<AccessDraft | null>(null);
  const [accountDraft, setAccountDraft] = useState<AccountDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const userResult = await supabase.auth.getUser();
      if (userResult.error) throw userResult.error;
      setCurrentUserId(userResult.data.user?.id ?? null);

      const [orgResult, vesselResult, memberResult, vesselMemberResult, auditResult] = await Promise.all([
        supabase.from("organizations").select("id,name").eq("id", organizationId).maybeSingle(),
        supabase.from("vessels").select("id,name,imo_number,call_sign").eq("organization_id", organizationId).order("name"),
        supabase.from("organization_members").select("user_id,role,active,invited_at").eq("organization_id", organizationId),
        supabase.from("vessel_members").select("vessel_id,user_id,role"),
        supabase.from("audit_logs").select("id,actor_id,action,summary,created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(10)
      ]);
      const firstError = orgResult.error || vesselResult.error || memberResult.error || vesselMemberResult.error || auditResult.error;
      if (firstError) throw firstError;

      const members = (memberResult.data ?? []) as MemberRow[];
      const ids = Array.from(new Set(members.map((item) => item.user_id)));
      let profiles: ProfileRow[] = [];
      if (ids.length) {
        const profileResult = await supabase.from("profiles").select("id,full_name,email").in("id", ids);
        if (profileResult.error) throw profileResult.error;
        profiles = (profileResult.data ?? []) as ProfileRow[];
      }

      setData({
        organization: orgResult.data as Organization | null,
        vessels: (vesselResult.data ?? []) as VesselRow[],
        members,
        vesselMembers: (vesselMemberResult.data ?? []) as VesselMemberRow[],
        profiles,
        auditLogs: (auditResult.data ?? []) as AuditRow[]
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load administration data.");
    } finally {
      setLoading(false);
    }
  }, [organizationId, supabase]);

  useEffect(() => { void loadAdminData(); }, [loadAdminData]);

  const currentRole = data.members.find((member) => member.user_id === currentUserId)?.role?.toLowerCase() ?? "member";
  const canManage = MANAGER_ROLES.has(currentRole);
  const profile = (userId: string) => data.profiles.find((item) => item.id === userId);
  const profileName = (userId: string) => profile(userId)?.full_name?.trim() || "SEAVANT USER";
  const profileEmail = (userId: string) => profile(userId)?.email?.trim() || (userId === currentUserId ? currentUserEmail : null) || "ACCOUNT";
  const vesselMemberCount = (vesselId: string) => data.vesselMembers.filter((assignment) => assignment.vessel_id === vesselId && data.members.some((member) => member.user_id === assignment.user_id && member.active)).length;
  const vesselRole = (vesselId: string, userId: string) => data.vesselMembers.find((assignment) => assignment.vessel_id === vesselId && assignment.user_id === userId)?.role;
  const memberAssignments = (userId: string) => data.vessels.map((vessel) => ({ vessel, role: vesselRole(vessel.id, userId) })).filter((item) => item.role);
  const displayRole = (member: MemberRow): AccessRole | "owner" => {
    if (member.role === "owner" || member.role === "admin") return member.role;
    return (memberAssignments(member.user_id)[0]?.role as AccessRole | undefined) ?? "viewer";
  };
  const roleLabel = (role: string) => role === "officer" ? "BRIDGE" : role === "viewer" ? "VIEW ONLY" : role.toUpperCase();

  function toggleVessel(ids: string[], vesselId: string) {
    return ids.includes(vesselId) ? ids.filter((id) => id !== vesselId) : [...ids, vesselId];
  }

  function beginEdit(vessel: VesselRow) {
    setEditingId(vessel.id);
    setDraft({ name: vessel.name, imo_number: vessel.imo_number ?? "", call_sign: vessel.call_sign ?? "" });
    setMessage(null);
  }

  function beginAccessEdit(member: MemberRow) {
    const role = displayRole(member);
    if (role === "owner") return;
    setAccessDraft({ userId: member.user_id, role, vesselIds: memberAssignments(member.user_id).map((item) => item.vessel.id) });
    setAccountDraft(null);
    setMessage(null);
  }

  function beginAccountEdit(member: MemberRow) {
    setAccountDraft({ userId: member.user_id, password: "", confirmation: "", deleteConfirmation: "" });
    setAccessDraft(null);
    setMessage(null);
  }

  async function saveVessel(vesselId: string) {
    const name = draft.name.trim();
    if (!name) { setMessage("Vessel name is required."); return; }
    setSaving(true);
    setMessage(null);
    try {
      const { error: updateError } = await supabase.from("vessels").update({
        name,
        imo_number: draft.imo_number.trim() || null,
        call_sign: draft.call_sign.trim().toUpperCase() || null,
        updated_at: new Date().toISOString()
      }).eq("id", vesselId).eq("organization_id", organizationId);
      if (updateError) throw updateError;
      setEditingId(null);
      await loadAdminData();
      setMessage("Vessel particulars saved.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to save vessel particulars.");
    } finally {
      setSaving(false);
    }
  }

  async function inviteUser() {
    if (!inviteDraft.email.trim()) { setMessage("Enter the user's email address."); return; }
    if (inviteDraft.role !== "admin" && inviteDraft.vesselIds.length === 0) { setMessage("Assign at least one vessel."); return; }
    setSaving(true);
    setMessage(null);
    try {
      const { data: result, error: inviteError } = await supabase.functions.invoke("invite-seavant-user", {
        body: {
          organizationId,
          email: inviteDraft.email,
          fullName: inviteDraft.fullName,
          accessRole: inviteDraft.role,
          vesselIds: inviteDraft.vesselIds
        }
      });
      if (inviteError) throw inviteError;
      if (result?.error) throw new Error(result.error);
      setInviteDraft(EMPTY_INVITE);
      setInviteOpen(false);
      await loadAdminData();
      setMessage(result?.message ?? "User access created.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to invite the user.");
    } finally {
      setSaving(false);
    }
  }

  async function saveAccess() {
    if (!accessDraft) return;
    if (accessDraft.role !== "admin" && accessDraft.vesselIds.length === 0) { setMessage("Assign at least one vessel."); return; }
    setSaving(true);
    setMessage(null);
    try {
      const organizationRole = accessDraft.role === "admin" ? "admin" : "viewer";
      const { error: memberError } = await supabase.from("organization_members").update({
        role: organizationRole,
        active: true,
        updated_at: new Date().toISOString()
      }).eq("organization_id", organizationId).eq("user_id", accessDraft.userId);
      if (memberError) throw memberError;

      const vesselIds = data.vessels.map((vessel) => vessel.id);
      if (vesselIds.length) {
        const { error: clearError } = await supabase.from("vessel_members").delete().eq("user_id", accessDraft.userId).in("vessel_id", vesselIds);
        if (clearError) throw clearError;
      }
      if (accessDraft.role !== "admin" && accessDraft.vesselIds.length) {
        const { error: assignmentError } = await supabase.from("vessel_members").insert(
          accessDraft.vesselIds.map((vesselId) => ({ vessel_id: vesselId, user_id: accessDraft.userId, role: accessDraft.role }))
        );
        if (assignmentError) throw assignmentError;
      }

      setAccessDraft(null);
      await loadAdminData();
      setMessage("User access updated.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to update user access.");
    } finally {
      setSaving(false);
    }
  }

  async function setMemberActive(member: MemberRow, active: boolean) {
    if (member.role === "owner" || member.user_id === currentUserId) return;
    setSaving(true);
    setMessage(null);
    try {
      const { error: updateError } = await supabase.from("organization_members").update({
        active,
        updated_at: new Date().toISOString()
      }).eq("organization_id", organizationId).eq("user_id", member.user_id);
      if (updateError) throw updateError;
      await loadAdminData();
      setMessage(active ? "User access reactivated." : "User access deactivated.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to change user status.");
    } finally {
      setSaving(false);
    }
  }

  async function setTemporaryPassword() {
    if (!accountDraft) return;
    if (accountDraft.password.length < 8) { setMessage("Temporary passwords must contain at least 8 characters."); return; }
    if (accountDraft.password !== accountDraft.confirmation) { setMessage("The temporary passwords do not match."); return; }
    setSaving(true);
    setMessage(null);
    try {
      const { data: result, error: functionError } = await supabase.functions.invoke("manage-seavant-user", {
        body: { organizationId, targetUserId: accountDraft.userId, action: "set_temporary_password", temporaryPassword: accountDraft.password }
      });
      if (functionError) throw functionError;
      if (result?.error) throw new Error(result.error);
      setAccountDraft(null);
      await loadAdminData();
      setMessage(result?.message ?? "Temporary password saved.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to set the temporary password.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAccount() {
    if (!accountDraft || accountDraft.deleteConfirmation !== "DELETE") return;
    setSaving(true);
    setMessage(null);
    try {
      const { data: result, error: functionError } = await supabase.functions.invoke("manage-seavant-user", {
        body: { organizationId, targetUserId: accountDraft.userId, action: "delete_user" }
      });
      if (functionError) throw functionError;
      if (result?.error) throw new Error(result.error);
      setAccountDraft(null);
      await loadAdminData();
      setMessage(result?.message ?? "User account deleted.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to delete the account.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <section className="panel workspaceShell"><div className="eyebrow">ADMIN</div><h2>Loading fleet administration…</h2></section>;

  return <section className="adminWorkspace">
    <article className="panel adminHero">
      <div><div className="eyebrow">FLEET ADMINISTRATION</div><h2>{data.organization?.name ?? "SEAVANT ORGANIZATION"}</h2><p>Vessel particulars, maritime roles, vessel assignments, and permission history.</p></div>
      <div className="adminModeBadge">{canManage ? `${currentRole.toUpperCase()} · MANAGE` : "READ ONLY"}</div>
    </article>

    {error && <article className="panel adminError">{error}</article>}
    {message && <article className="panel adminNotice">{message}</article>}

    <div className="adminSummaryGrid">
      <AdminMetric label="VESSELS" value={String(data.vessels.length)} />
      <AdminMetric label="ACTIVE USERS" value={String(data.members.filter((member) => member.active).length)} />
      <AdminMetric label="VESSEL ASSIGNMENTS" value={String(data.vesselMembers.length)} />
      <AdminMetric label="ACTIVE VESSEL" value={data.vessels.find((vessel) => vessel.id === selectedVesselId)?.name ?? "--"} />
    </div>

    <div className="adminGrid">
      <article className="panel adminPanel">
        <div className="adminPanelHeader"><div><div className="sectionTitle">FLEET</div><p>Vessel identity and statutory particulars.</p></div><button className="secondaryAction compactAction" disabled>+ ADD VESSEL</button></div>
        <div className="adminList">
          {data.vessels.map((vessel) => {
            const editing = editingId === vessel.id;
            return <div className={`adminRow adminVesselRow ${vessel.id === selectedVesselId ? "selected" : ""}`} key={vessel.id}>
              {editing ? <div className="adminEditForm">
                <label>VESSEL NAME<input value={draft.name} onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))} /></label>
                <label>IMO NUMBER<input value={draft.imo_number} inputMode="numeric" onChange={(event) => setDraft((value) => ({ ...value, imo_number: event.target.value.replace(/\D/g, "").slice(0, 7) }))} placeholder="7 digits" /></label>
                <label>CALL SIGN<input value={draft.call_sign} onChange={(event) => setDraft((value) => ({ ...value, call_sign: event.target.value.toUpperCase() }))} /></label>
                <div className="adminEditActions"><button className="secondaryAction compactAction" onClick={() => setEditingId(null)} disabled={saving}>CANCEL</button><button className="primaryAction compactAction" onClick={() => void saveVessel(vessel.id)} disabled={saving}>{saving ? "SAVING…" : "SAVE"}</button></div>
              </div> : <>
                <div className="adminVesselIdentity"><strong>{vessel.name}</strong><span>{vessel.imo_number ? `IMO ${vessel.imo_number}` : "IMO NOT SET"} · {vessel.call_sign ? `CALL ${vessel.call_sign}` : "CALL SIGN NOT SET"}</span></div>
                <div className="adminVesselActions"><div className="adminRowMeta"><strong>{vesselMemberCount(vessel.id)}</strong><span>USERS</span></div>{canManage && <button className="secondaryAction compactAction" onClick={() => beginEdit(vessel)}>EDIT</button>}</div>
              </>}
            </div>;
          })}
          {!data.vessels.length && <div className="emptyState">No vessels available.</div>}
        </div>
      </article>

      <article className="panel adminPanel">
        <div className="adminPanelHeader"><div><div className="sectionTitle">PEOPLE & ACCESS</div><p>Organization roles and vessel assignments.</p></div>{canManage && <button className="secondaryAction compactAction" onClick={() => setInviteOpen((open) => !open)}>{inviteOpen ? "CLOSE" : "INVITE USER"}</button>}</div>

        {inviteOpen && <div className="adminAccessEditor adminInviteEditor">
          <div className="adminEditorHeading"><strong>INVITE SEAVANT USER</strong><span>An invitation email will be sent to a new account.</span></div>
          <div className="adminEditorFields">
            <label>FULL NAME<input value={inviteDraft.fullName} onChange={(event) => setInviteDraft((value) => ({ ...value, fullName: event.target.value }))} /></label>
            <label>EMAIL<input type="email" value={inviteDraft.email} onChange={(event) => setInviteDraft((value) => ({ ...value, email: event.target.value }))} /></label>
            <label>ROLE<select value={inviteDraft.role} onChange={(event) => setInviteDraft((value) => ({ ...value, role: event.target.value as AccessRole }))}>{ROLE_OPTIONS.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>
          </div>
          {inviteDraft.role !== "admin" && <VesselPicker vessels={data.vessels} selected={inviteDraft.vesselIds} onToggle={(id) => setInviteDraft((value) => ({ ...value, vesselIds: toggleVessel(value.vesselIds, id) }))} />}
          <div className="adminEditorActions"><button className="secondaryAction compactAction" onClick={() => { setInviteOpen(false); setInviteDraft(EMPTY_INVITE); }} disabled={saving}>CANCEL</button><button className="primaryAction compactAction" onClick={() => void inviteUser()} disabled={saving}>{saving ? "SENDING…" : "SEND INVITATION"}</button></div>
        </div>}

        <div className="adminList">
          {data.members.map((member) => {
            const assignments = memberAssignments(member.user_id);
            const role = displayRole(member);
            const editing = accessDraft?.userId === member.user_id;
            const editingAccount = accountDraft?.userId === member.user_id;
            const canManageAccount = member.role !== "owner" && member.user_id !== currentUserId && (currentRole === "owner" || member.role !== "admin");
            return <div className="adminMemberBlock" key={member.user_id}>
              <div className={`adminAccessRow ${member.active ? "" : "inactive"}`}>
                <div className="adminAvatar">{profileName(member.user_id).slice(0, 2).toUpperCase()}</div>
                <div className="adminAccessIdentity"><strong>{profileName(member.user_id)}</strong><span>{profileEmail(member.user_id)}</span></div>
                <div className="adminRole"><span>{member.active ? "ACTIVE" : "INACTIVE"}</span><strong>{roleLabel(role)}</strong></div>
                <div className="adminAssignments">{role === "owner" || role === "admin" ? <span>ALL VESSELS · {role.toUpperCase()}</span> : assignments.length ? assignments.map((item) => <span key={item.vessel.id}>{item.vessel.name} · {roleLabel(item.role!)}</span>) : <span>NO VESSEL ASSIGNMENT</span>}</div>
                {canManageAccount && <div className="adminMemberActions"><button className="secondaryAction compactAction" onClick={() => editing ? setAccessDraft(null) : beginAccessEdit(member)}>{editing ? "CLOSE" : "EDIT ACCESS"}</button><button className="secondaryAction compactAction" onClick={() => editingAccount ? setAccountDraft(null) : beginAccountEdit(member)}>{editingAccount ? "CLOSE" : "ACCOUNT"}</button><button className={member.active ? "dangerAction compactAction" : "secondaryAction compactAction"} onClick={() => void setMemberActive(member, !member.active)} disabled={saving}>{member.active ? "DEACTIVATE" : "REACTIVATE"}</button></div>}
              </div>
              {editing && accessDraft && <div className="adminAccessEditor">
                <div className="adminEditorFields singleField"><label>ROLE<select value={accessDraft.role} onChange={(event) => setAccessDraft((value) => value ? ({ ...value, role: event.target.value as AccessRole }) : value)}>{ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div>
                {accessDraft.role !== "admin" && <VesselPicker vessels={data.vessels} selected={accessDraft.vesselIds} onToggle={(id) => setAccessDraft((value) => value ? ({ ...value, vesselIds: toggleVessel(value.vesselIds, id) }) : value)} />}
                <div className="adminRoleDetail">{ROLE_OPTIONS.find((option) => option.value === accessDraft.role)?.detail}</div>
                <div className="adminEditorActions"><button className="secondaryAction compactAction" onClick={() => setAccessDraft(null)} disabled={saving}>CANCEL</button><button className="primaryAction compactAction" onClick={() => void saveAccess()} disabled={saving}>{saving ? "SAVING…" : "SAVE ACCESS"}</button></div>
              </div>}
              {editingAccount && accountDraft && <div className="adminAccessEditor adminAccountEditor">
                <div className="adminEditorHeading"><strong>ACCOUNT SECURITY</strong><span>Existing passwords cannot be viewed. Set a temporary replacement that the user must change at their next sign-in.</span></div>
                <div className="adminEditorFields accountPasswordFields">
                  <label>TEMPORARY PASSWORD<input type="password" value={accountDraft.password} onChange={(event) => setAccountDraft((value) => value ? ({ ...value, password: event.target.value }) : value)} autoComplete="new-password" minLength={8} /></label>
                  <label>CONFIRM PASSWORD<input type="password" value={accountDraft.confirmation} onChange={(event) => setAccountDraft((value) => value ? ({ ...value, confirmation: event.target.value }) : value)} autoComplete="new-password" minLength={8} /></label>
                </div>
                <div className="adminEditorActions"><button className="primaryAction compactAction" onClick={() => void setTemporaryPassword()} disabled={saving}>{saving ? "SAVING…" : "SET TEMPORARY PASSWORD"}</button></div>
                <div className="adminDeleteZone">
                  <div><strong>PERMANENTLY DELETE ACCOUNT</strong><span>This removes the user, vessel assignments, and SEAVANT sign-in. Type DELETE to confirm.</span></div>
                  <input value={accountDraft.deleteConfirmation} onChange={(event) => setAccountDraft((value) => value ? ({ ...value, deleteConfirmation: event.target.value.toUpperCase() }) : value)} placeholder="TYPE DELETE" />
                  <button className="dangerAction compactAction" onClick={() => void deleteAccount()} disabled={saving || accountDraft.deleteConfirmation !== "DELETE"}>{saving ? "WORKING…" : "DELETE ACCOUNT"}</button>
                </div>
              </div>}
            </div>;
          })}
          {!data.members.length && <div className="emptyState">No organization users found.</div>}
        </div>
      </article>
    </div>

    {canManage && <article className="panel adminPanel adminAuditPanel">
      <div className="adminPanelHeader"><div><div className="sectionTitle">PERMISSION HISTORY</div><p>Most recent vessel, role, assignment, and account changes.</p></div></div>
      {data.auditLogs.length ? <div className="adminAuditList">{data.auditLogs.map((entry) => <div className="adminAuditRow" key={entry.id}><time>{new Date(entry.created_at).toLocaleString()}</time><strong>{entry.summary}</strong><span>{entry.actor_id ? profileName(entry.actor_id) : "SEAVANT IDENTITY SERVICE"}</span></div>)}</div> : <div className="emptyState">No administration changes recorded yet.</div>}
    </article>}

    <article className="panel adminRoadmap">
      <div className="sectionTitle">ADMIN ROADMAP</div>
      <div className="adminRoadmapGrid"><div><strong>01</strong><span>Vessel particulars · COMPLETE</span></div><div><strong>02</strong><span>Users, roles, and assignments · ACTIVE</span></div><div><strong>03</strong><span>Integrations and AIS endpoints · NEXT</span></div><div><strong>04</strong><span>Permission history · ACTIVE</span></div></div>
    </article>
  </section>;
}

function VesselPicker({ vessels, selected, onToggle }: { vessels: VesselRow[]; selected: string[]; onToggle: (id: string) => void }) {
  return <div className="adminVesselPicker"><span>VESSEL ACCESS</span><div>{vessels.map((vessel) => <label key={vessel.id}><input type="checkbox" checked={selected.includes(vessel.id)} onChange={() => onToggle(vessel.id)} />{vessel.name}</label>)}</div></div>;
}

function AdminMetric({ label, value }: { label: string; value: string }) {
  return <article className="panel adminMetric"><span>{label}</span><strong>{value}</strong></article>;
}
