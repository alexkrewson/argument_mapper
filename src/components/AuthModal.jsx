import { useState } from "react";
import { supabase } from "../utils/supabase";

export default function AuthModal({ onClose }) {
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [signupDone, setSignupDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onClose();
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setSignupDone(true);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="concession-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="concession-modal auth-modal">
        <div className="concession-modal-header">
          {mode === "signin" ? "Sign in" : "Create account"}
        </div>

        {signupDone ? (
          <div className="auth-signup-done">
            <p>Check your email for a confirmation link, then sign in.</p>
            <button className="concession-btn-confirm" onClick={() => { setSignupDone(false); setMode("signin"); }}>
              Go to sign in
            </button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <input
              className="auth-input"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
            <input
              className="auth-input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
            {error && <p className="auth-error">{error}</p>}
            <button className="concession-btn-confirm" type="submit" disabled={loading}>
              {loading ? "..." : mode === "signin" ? "Sign in" : "Create account"}
            </button>
            <button
              type="button"
              className="auth-toggle-link"
              onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); }}
            >
              {mode === "signin" ? "No account? Sign up" : "Have an account? Sign in"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
