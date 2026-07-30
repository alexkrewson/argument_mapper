import { useState } from "react";
import { supabase } from "../utils/supabase";

export default function AuthModal({ onClose, initialMode = "signin" }) {
  // "signin" | "signup" | "forgot" | "otp_verify" | "reset_password" | "change_password"
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [signupDone, setSignupDone] = useState(false);
  const [changeDone, setChangeDone] = useState(false);

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

  // Signed-in change. Re-authenticates first so someone who walks up to an
  // unlocked session can't silently take the account over.
  const handleChangePassword = async (e) => {
    e.preventDefault();
    clearError();
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error("You're not signed in.");

      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });
      if (reauthError) throw new Error("Current password is incorrect.");

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setChangeDone(true);
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
    change_password: "Change password",
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

        ) : changeDone ? (
          <div className="auth-signup-done">
            <p data-testid="auth-change-done">Password updated.</p>
            <button className="concession-btn-confirm" onClick={onClose} data-testid="auth-change-close">
              Done
            </button>
          </div>

        ) : mode === "change_password" ? (
          <form className="auth-form" onSubmit={handleChangePassword}>
            <p className="auth-hint">Confirm your current password, then choose a new one.</p>
            <input className="auth-input" type="password" placeholder="Current password" value={password}
              onChange={(e) => setPassword(e.target.value)} required autoFocus
              data-testid="auth-current-password" />
            <input className="auth-input" type="password" placeholder="New password" value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)} required minLength={6}
              data-testid="auth-new-password" />
            {error && <p className="auth-error" data-testid="auth-error">{error}</p>}
            <button className="concession-btn-confirm" type="submit"
              disabled={loading || newPassword.length < 6} data-testid="auth-change-submit">
              {loading ? "..." : "Update password"}
            </button>
            <button type="button" className="auth-toggle-link" onClick={onClose}>
              Cancel
            </button>
          </form>

        ) : mode === "signin" ? (
          <form className="auth-form" onSubmit={handleSignIn}>
            <input className="auth-input" type="email" placeholder="Email" value={email}
              onChange={(e) => setEmail(e.target.value)} required autoFocus data-testid="auth-email" />
            <input className="auth-input" type="password" placeholder="Password" value={password}
              onChange={(e) => setPassword(e.target.value)} required minLength={6} data-testid="auth-password" />
            {error && <p className="auth-error" data-testid="auth-error">{error}</p>}
            <button className="concession-btn-confirm" type="submit" disabled={loading} data-testid="auth-submit">
              {loading ? "..." : "Sign in"}
            </button>
            <button type="button" className="auth-toggle-link" data-testid="auth-toggle-signup"
              onClick={() => { setMode("signup"); clearError(); }}>
              No account? Sign up
            </button>
            <button type="button" className="auth-toggle-link" data-testid="auth-toggle-forgot"
              onClick={() => { setMode("forgot"); clearError(); }}>
              Forgot password?
            </button>
          </form>

        ) : mode === "signup" ? (
          <form className="auth-form" onSubmit={handleSignUp}>
            <input className="auth-input" type="email" placeholder="Email" value={email}
              onChange={(e) => setEmail(e.target.value)} required autoFocus data-testid="auth-email" />
            <input className="auth-input" type="password" placeholder="Password" value={password}
              onChange={(e) => setPassword(e.target.value)} required minLength={6} data-testid="auth-password" />
            {error && <p className="auth-error">{error}</p>}
            <button className="concession-btn-confirm" type="submit" disabled={loading} data-testid="auth-submit">
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
            <p className="auth-hint">Enter the 8-digit code sent to {email}.</p>
            <input className="auth-input auth-otp-input" type="text" inputMode="numeric"
              placeholder="00000000" maxLength={8} value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} required autoFocus />
            {error && <p className="auth-error">{error}</p>}
            <button className="concession-btn-confirm" type="submit" disabled={loading || otp.length < 8}>
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
