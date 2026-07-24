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

  // Scoped to this app's data only. auth.users is a pool shared across
  // multiple apps in this Supabase project, so we deliberately don't delete
  // the login itself here — only iDisagree's debates and credit balance.
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

  return new Response(JSON.stringify({ deleted: true }), {
    status: 200, headers: { "Content-Type": "application/json", ...CORS },
  });
});
