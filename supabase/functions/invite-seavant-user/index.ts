import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type User } from "npm:@supabase/supabase-js@2.112.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const ACCESS_ROLES = new Set(["admin", "master", "officer", "engineer", "viewer"]);

type InviteRequest = {
  organizationId?: string;
  email?: string;
  fullName?: string;
  accessRole?: string;
  vesselIds?: string[];
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

async function findUserByEmail(admin: ReturnType<typeof createClient>, email: string): Promise<User | null> {
  const perPage = 200;
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.toLowerCase() === email);
    if (match) return match;
    if (data.users.length < perPage) return null;
  }
  return null;
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

    const token = authHeader.slice(7);
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data: callerData, error: callerError } = await admin.auth.getUser(token);
    if (callerError || !callerData.user) return json({ error: "Invalid or expired session." }, 401);

    const body = await req.json() as InviteRequest;
    const organizationId = body.organizationId?.trim() ?? "";
    const email = body.email?.trim().toLowerCase() ?? "";
    const fullName = body.fullName?.trim() ?? "";
    const accessRole = body.accessRole?.trim().toLowerCase() ?? "viewer";
    const requestedVesselIds = Array.from(new Set(body.vesselIds ?? []));

    if (!organizationId || !email || !/^\S+@\S+\.\S+$/.test(email)) return json({ error: "A valid email address is required." }, 400);
    if (!ACCESS_ROLES.has(accessRole)) return json({ error: "Invalid access role." }, 400);

    const { data: callerMembership, error: membershipError } = await admin
      .from("organization_members")
      .select("role,active")
      .eq("organization_id", organizationId)
      .eq("user_id", callerData.user.id)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!callerMembership?.active || !["owner", "admin"].includes(callerMembership.role)) {
      return json({ error: "Organization manager access is required." }, 403);
    }

    const { data: organizationVessels, error: vesselError } = await admin
      .from("vessels")
      .select("id")
      .eq("organization_id", organizationId);
    if (vesselError) throw vesselError;
    const allowedVesselIds = new Set((organizationVessels ?? []).map((vessel) => vessel.id as string));
    const vesselIds = requestedVesselIds.filter((id) => allowedVesselIds.has(id));
    if (accessRole !== "admin" && vesselIds.length === 0) {
      return json({ error: "Assign at least one vessel for this role." }, 400);
    }

    let invited = false;
    let invitedUser = await findUserByEmail(admin, email);
    if (!invitedUser) {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName || undefined }
      });
      if (error) throw error;
      invitedUser = data.user;
      invited = true;
    }
    if (!invitedUser) throw new Error("The user account could not be created.");

    const now = new Date().toISOString();
    const { error: profileError } = await admin.from("profiles").upsert({
      id: invitedUser.id,
      email,
      full_name: fullName || invitedUser.user_metadata?.full_name || null,
      updated_at: now
    }, { onConflict: "id" });
    if (profileError) throw profileError;

    const organizationRole = accessRole === "admin" ? "admin" : "viewer";
    const { error: orgMemberError } = await admin.from("organization_members").upsert({
      organization_id: organizationId,
      user_id: invitedUser.id,
      role: organizationRole,
      active: true,
      invited_by: callerData.user.id,
      invited_at: now,
      updated_at: now
    }, { onConflict: "organization_id,user_id" });
    if (orgMemberError) throw orgMemberError;

    if (vesselIds.length) {
      const vesselRole = accessRole === "admin" ? "viewer" : accessRole;
      const { error: assignmentError } = await admin.from("vessel_members").upsert(
        vesselIds.map((vesselId) => ({ vessel_id: vesselId, user_id: invitedUser!.id, role: vesselRole })),
        { onConflict: "vessel_id,user_id" }
      );
      if (assignmentError) throw assignmentError;
    }

    return json({
      success: true,
      invited,
      message: invited ? `Invitation sent to ${email}.` : `${email} already had a SEAVANT account and was granted access.`
    });
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : "Unable to invite the user.";
    return json({ error }, 400);
  }
});
