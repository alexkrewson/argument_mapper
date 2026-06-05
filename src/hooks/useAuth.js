import { useState, useEffect } from "react";
import { supabase } from "../utils/supabase";

export function useAuth() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authEvent, setAuthEvent] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setAuthEvent(event);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { user, authLoading, authEvent };
}
