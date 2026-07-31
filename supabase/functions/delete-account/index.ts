import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST",
};

// Other apps sharing this project's auth.users, as "schema.table:user_column".
// Deleting the login signs the person out of these too, so we check whether
// they actually have anything in them before showing a warning that says so.
//
// Override with the OTHER_APP_TABLES env var (same format, comma separated) —
// the defaults are a guess and a wrong entry is treated as "no data", never as
// a reason to block the delete.
const OTHER_APP_TABLES = (Deno.env.get("OTHER_APP_TABLES") ??
  "packing_list.lists:user_id,comment_cluster.analyses:user_id")
  .split(",").map((s) => s.trim()).filter(Boolean);

/** Which other apps hold rows for this user. Never throws. */
async function otherAppsWithData(url: string, serviceKey: string, userId: string) {
  const found: string[] = [];
  for (const entry of OTHER_APP_TABLES) {
    const [location, column = "user_id"] = entry.split(":");
    const [schema, table] = location.split(".");
    if (!schema || !table) continue;
    try {
      const res = await fetch(
        `${url}/rest/v1/${table}?${column}=eq.${userId}&limit=1&select=${column}`,
        {
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            "Accept-Profile": schema,
          },
        },
      );
      if (!res.ok) continue; // schema/table doesn't exist here — nothing to warn about
      const rows = await res.json();
      if (Array.isArray(rows) && rows.length > 0) found.push(schema);
    } catch {
      // Unreachable table is not a reason to warn.
    }
  }
  return found;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  // GET = read-only probe, POST = destructive. Deliberately split by method:
  // an older deployment of this function treats EVERY POST as a delete, so a
  // POST-based probe would wipe data against it. GET simply 405s there, which
  // the client reads as "unknown" and falls back to the broad warning.
  const isProbe = req.method === "GET";
  if (!isProbe && req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS });
  }

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
  // Answers "would deleting the login cost this person anything elsewhere?"
  // so the UI warns only when it's actually true. Deletes nothing.
  if (isProbe) {
    const sharedApps = await otherAppsWithData(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      user.id,
    );
    return new Response(JSON.stringify({ sharedApps }), {
      status: 200, headers: { "Content-Type": "application/json", ...CORS },
    });
  }

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

  // Data-only: zero the balance but KEEP the row. handle_new_user() only fires
  // on insert into auth.users, and the app only ever selects from profiles —
  // so deleting the row left the account with no profile and no way to get one
  // back. The credits card is conditional on a non-null balance, which meant
  // Buy Credits disappeared permanently and the account could never purchase
  // again. Only remove the row when the auth user is going too.
  const { error: profileError } = deleteAccount
    ? await supabaseAdmin.from("profiles").delete().eq("id", user.id)
    : await supabaseAdmin.from("profiles").update({ credits_cents: 0 }).eq("id", user.id);

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
