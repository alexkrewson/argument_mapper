import { useState } from "react";
import { supabase } from "../utils/supabase";

export default function AuthModal({ onClose }) {
  const [mode, setMode] = useState("signin"); // "signin" | "signup" | "forgot" | "otp_verify" | "reset_password"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [signupDone, setSignupDone] = useState(false);

  const clearError = () => setError(null);

  const handleSignIn = async (e) => {
    e.preventDefault();
    clearError();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    clearError();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      setSignupDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    clearError();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });
      if (error) throw error;
      setMode("otp_verify");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    clearError();
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ email, token: otp, type: "email" });
      if (error) throw error;
      setMode("reset_password");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    clearError();
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const goToSignIn = () => { setMode("signin"); setOtp(""); setNewPassword(""); clearError(); };

  const title = {
    signin: "Sign in",
    signup: "Create account",
    forgot: "Reset password",
    otp_verify: "Enter code",
    reset_password: "Set new password",
  }[mode];

  return (
    <div className="concession-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="concession-modal auth-modal">
        <div className="concession-modal-header">{title}</div>

        {signupDone ? (
          <div className="auth-signup-done">
            <p>Check your email for a confirmation link, then sign in.</p>
            <button className="concession-btn-confirm" onClick={() => { setSignupDone(false); setMode("signin"); }}>
              Go to sign in
            </button>
          </div>

        ) : mode === "signin" ? (
          <form className="auth-form" onSubmit={handleSignIn}>
            <input className="auth-input" type="email" placeholder="Email" value={email}
              onChange={(e) => setEmail(e.target.value)} required autoFocus />
            <input className="auth-input" type="password" placeholder="Password" value={password}
              onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            {error && <p className="auth-error">{error}</p>}
            <button className="concession-btn-confirm" type="submit" disabled={loading}>
              {loading ? "..." : "Sign in"}
            </button>
            <button type="button" className="auth-toggle-link"
              onClick={() => { setMode("signup"); clearError(); }}>
              No account? Sign up
            </button>
            <button type="button" className="auth-toggle-link"
              onClick={() => { setMode("forgot"); clearError(); }}>
              Forgot password?
            </button>
          </form>

        ) : mode === "signup" ? (
          <form className="auth-form" onSubmit={handleSignUp}>
            <input className="auth-input" type="email" placeholder="Email" value={email}
              onChange={(e) => setEmail(e.target.value)} required autoFocus />
            <input className="auth-input" type="password" placeholder="Password" value={password}
              onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            {error && <p className="auth-error">{error}</p>}
            <button className="concession-btn-confirm" type="submit" disabled={loading}>
              {loading ? "..." : "Create account"}
            </button>
            <button type="button" className="auth-toggle-link"
              onClick={() => { setMode("signin"); clearError(); }}>
              Have an account? Sign in
            </button>
          </form>

        ) : mode === "forgot" ? (
          <form className="auth-form" onSubmit={handleForgot}>
            <p className="auth-hint">Enter your email and we'll send a verification code.</p>
            <input className="auth-input" type="email" placeholder="Email" value={email}
              onChange={(e) => setEmail(e.target.value)} required autoFocus />
            {error && <p className="auth-error">{error}</p>}
            <button className="concession-btn-confirm" type="submit" disabled={loading}>
              {loading ? "..." : "Send code"}
            </button>
            <button type="button" className="auth-toggle-link" onClick={goToSignIn}>
              Back to sign in
            </button>
          </form>

        ) : mode === "otp_verify" ? (
          <form className="auth-form" onSubmit={handleVerifyOtp}>
            <p className="auth-hint">Enter the 6-digit code sent to {email}.</p>
            <input className="auth-input auth-otp-input" type="text" inputMode="numeric"
              placeholder="000000" maxLength={6} value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} required autoFocus />
            {error && <p className="auth-error">{error}</p>}
            <button className="concession-btn-confirm" type="submit" disabled={loading || otp.length < 6}>
              {loading ? "..." : "Verify code"}
            </button>
            <button type="button" className="auth-toggle-link"
              onClick={() => { setMode("forgot"); setOtp(""); clearError(); }}>
              Resend code
            </button>
            <button type="button" className="auth-toggle-link" onClick={goToSignIn}>
              Back to sign in
            </button>
          </form>

        ) : mode === "reset_password" ? (
          <form className="auth-form" onSubmit={handleResetPassword}>
            <p className="auth-hint">Choose a new password for your account.</p>
            <input className="auth-input" type="password" placeholder="New password" value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)} required minLength={6} autoFocus />
            {error && <p className="auth-error">{error}</p>}
            <button className="concession-btn-confirm" type="submit" disabled={loading || newPassword.length < 6}>
              {loading ? "..." : "Set password"}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
