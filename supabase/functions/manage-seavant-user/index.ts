import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

type AccountAction = "set_temporary_password" | "delete_user";

type AccountRequest = {
  organizationId?: string;
  targetUserId?: string;
  action?: AccountAction;
  temporaryPassword?: string;
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authHeader = req.headers.get("Authorization");
    if (!supabaseUrl || !serviceRoleKey) return json({ error: "SEAVANT identity service is not configured." }, 500);
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Authentication required." }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data: callerData, error: callerError } = await admin.auth.getUser(authHeader.slice(7));
    if (callerError || !callerData.user) return json({ error: "Invalid or expired session." }, 401);

    const body = await req.json() as AccountRequest;
    const organizationId = body.organizationId?.trim() ?? "";
    const targetUserId = body.targetUserId?.trim() ?? "";
    const action = body.action;
    if (!organizationId || !targetUserId || !action) return json({ error: "Organization, user, and action are required." }, 400);
    if (targetUserId === callerData.user.id) return json({ error: "You cannot perform this action on your own account." }, 400);

    const [{ data: callerMembership, error: callerMembershipError }, { data: targetMembership, error: targetMembershipError }] = await Promise.all([
      admin.from("organization_members").select("role,active").eq("organization_id", organizationId).eq("user_id", callerData.user.id).maybeSingle(),
      admin.from("organization_members").select("role,active").eq("organization_id", organizationId).eq("user_id", targetUserId).maybeSingle()
    ]);
    if (callerMembershipError) throw callerMembershipError;
    if (targetMembershipError) throw targetMembershipError;
    if (!callerMembership?.active || !["owner", "admin"].includes(callerMembership.role)) {
      return json({ error: "Organization manager access is required." }, 403);
    }
    if (!targetMembership) return json({ error: "The selected user does not belong to this organization." }, 404);
    if (targetMembership.role === "owner") return json({ error: "The organization owner account cannot be changed here." }, 403);
    if (targetMembership.role === "admin" && callerMembership.role !== "owner") {
      return json({ error: "Only the organization owner can manage another administrator account." }, 403);
    }

    const { data: targetAuth, error: targetAuthError } = await admin.auth.admin.getUserById(targetUserId);
    if (targetAuthError || !targetAuth.user) throw targetAuthError ?? new Error("The selected Auth account was not found.");
    const targetLabel = targetAuth.user.email ?? targetUserId;

    if (action === "set_temporary_password") {
      const temporaryPassword = body.temporaryPassword ?? "";
      if (temporaryPassword.length < 8) return json({ error: "Temporary passwords must contain at least 8 characters." }, 400);
      const { error: updateError } = await admin.auth.admin.updateUserById(targetUserId, {
        password: temporaryPassword,
        user_metadata: { ...targetAuth.user.user_metadata, must_set_password: true }
      });
      if (updateError) throw updateError;

      const { error: auditError } = await admin.from("audit_logs").insert({
        organization_id: organizationId,
        actor_id: callerData.user.id,
        action: "account_password_reset",
        target_type: "user",
        target_id: targetUserId,
        summary: `Temporary password set for ${targetLabel}`,
        metadata: { target_email: targetAuth.user.email }
      });
      if (auditError) throw auditError;
      return json({ success: true, message: `Temporary password set for ${targetLabel}.` });
    }

    if (action === "delete_user") {
      const { count: otherMemberships, error: membershipCountError } = await admin
        .from("organization_members")
        .select("organization_id", { count: "exact", head: true })
        .eq("user_id", targetUserId)
        .neq("organization_id", organizationId);
      if (membershipCountError) throw membershipCountError;
      if ((otherMemberships ?? 0) > 0) return json({ error: "This account belongs to another organization and cannot be deleted here." }, 409);

      const { data: vessels, error: vesselError } = await admin.from("vessels").select("id").eq("organization_id", organizationId);
      if (vesselError) throw vesselError;
      const vesselIds = (vessels ?? []).map((vessel) => vessel.id as string);
      if (vesselIds.length) {
        const { error: vesselMemberError } = await admin.from("vessel_members").delete().eq("user_id", targetUserId).in("vessel_id", vesselIds);
        if (vesselMemberError) throw vesselMemberError;
      }
      const { error: organizationMemberError } = await admin.from("organization_members").delete().eq("organization_id", organizationId).eq("user_id", targetUserId);
      if (organizationMemberError) throw organizationMemberError;

      const { error: deleteAuthError } = await admin.auth.admin.deleteUser(targetUserId);
      if (deleteAuthError) throw deleteAuthError;
      const { error: profileError } = await admin.from("profiles").delete().eq("id", targetUserId);
      if (profileError) throw profileError;

      const { error: auditError } = await admin.from("audit_logs").insert({
        organization_id: organizationId,
        actor_id: callerData.user.id,
        action: "account_deleted",
        target_type: "user",
        target_id: targetUserId,
        summary: `Deleted account ${targetLabel}`,
        metadata: { target_email: targetAuth.user.email }
      });
      if (auditError) throw auditError;
      return json({ success: true, message: `Account ${targetLabel} was permanently deleted.` });
    }

    return json({ error: "Unsupported account action." }, 400);
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : "Unable to manage the user account.";
    return json({ error }, 400);
  }
});
