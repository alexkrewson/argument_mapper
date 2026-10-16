import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: "argument_mapper" },
  // PKCE rather than the implicit default, for Google sign-in on Android. The
  // implicit flow returns tokens in the redirect's #fragment; PKCE returns a
  // one-time code that is useless without the verifier kept in this app's own
  // storage, so a deep link intercepted on the way home is worth nothing. Web
  // uses the same flow so there is one code path — detectSessionInUrl picks
  // the ?code= up there automatically. Email sign-in never redirects, so it is
  // unaffected either way.
  auth: { flowType: "pkce" },
});
