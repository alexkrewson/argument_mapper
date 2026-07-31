import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")    return new Response("Method not allowed", { status: 405 });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "argument_mapper" } },
  );

  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!jwt) {
    return new Response(JSON.stringify({ error: "sign_in_required" }), {
      status: 401, headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(jwt);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "sign_in_required" }), {
      status: 401, headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  // Two modes.
  //
  // Default (no body, or { deleteAccount: false }) removes only this app's
  // data. auth.users is a pool shared across every app in this Supabase
  // project, so wiping iDisagree's rows must not touch the login.
  //
  // { deleteAccount: true } additionally deletes the auth user, which Google
  // Play requires an app offering account creation to provide. That WILL sign
  // the person out of the other apps sharing this project, which is why it's
  // opt-in and separately confirmed in the UI rather than folded into the
  // data-only path.
  let deleteAccount = false;
  try {
    const body = await req.json();
    deleteAccount = body?.deleteAccount === true;
  } catch {
    // No body — data-only, the original behaviour.
  }

  const { error: debatesError } = await supabaseAdmin
    .from("debates")
    .delete()
    .eq("user_id", user.id);

  if (debatesError) {
    return new Response(JSON.stringify({ error: "delete_failed", detail: debatesError.message }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .delete()
    .eq("id", user.id);

  if (profileError) {
    return new Response(JSON.stringify({ error: "delete_failed", detail: profileError.message }), {
      status: 500, headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  if (deleteAccount) {
    // Last, so a failure here still leaves the data deleted rather than
    // orphaning rows behind a login that no longer exists.
    const { error: userError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (userError) {
      return new Response(
        JSON.stringify({ error: "account_delete_failed", detail: userError.message, dataDeleted: true }),
        { status: 500, headers: { "Content-Type": "application/json", ...CORS } },
      );
    }
  }

  return new Response(JSON.stringify({ deleted: true, accountDeleted: deleteAccount }), {
    status: 200, headers: { "Content-Type": "application/json", ...CORS },
  });
});
