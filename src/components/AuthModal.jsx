import { useState, useEffect } from "react";
import { supabase } from "../utils/supabase";
import { Browser } from "@capacitor/browser";
import { signInWithGoogle, OAUTH_ERROR_EVENT } from "../utils/oauth";

export default function AuthModal({ onClose, initialMode = "signin" }) {
  // "signin" | "signup" | "forgot" | "otp_verify" | "reset_password" | "change_password"
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [changeDone, setChangeDone] = useState(false);
  // Which flow sent us to otp_verify: "signup" confirms a new address, "recovery"
  // is the first leg of a password reset. Same screen, different verifyOtp type
  // and different destination once the code checks out.
  const [otpPurpose, setOtpPurpose] = useState("recovery");

  // True while Google's sign-in is open in a Custom Tab (Android only; web
  // navigates away). The modal stays up so a failure has somewhere to show.
  const [googleWaiting, setGoogleWaiting] = useState(false);
  // Whether that tab is still on screen. Separate from googleWaiting because
  // the tab closes BEFORE the session arrives on success, and the listeners
  // below must outlive it. Closing it with the back button sends nothing back
  // to the app, so this is the only signal the attempt was abandoned.
  const [googleTabOpen, setGoogleTabOpen] = useState(false);

  const clearError = () => setError(null);

  useEffect(() => {
    if (!googleWaiting) return;
    const onError = (e) => { setError(e.detail); setGoogleWaiting(false); setGoogleTabOpen(false); };
    window.addEventListener(OAUTH_ERROR_EVENT, onError);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") onClose();
    });
    // browserFinished is Android/iOS only; on web the page has navigated away.
    const finished = Browser.addListener("browserFinished", () => setGoogleTabOpen(false));
    return () => {
      window.removeEventListener(OAUTH_ERROR_EVENT, onError);
      subscription.unsubscribe();
      finished.then((l) => l.remove()).catch(() => {});
    };
  }, [googleWaiting, onClose]);

  const handleGoogle = async () => {
    clearError();
    setGoogleWaiting(true);
    setGoogleTabOpen(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err.message);
      setGoogleWaiting(false);
      setGoogleTabOpen(false);
    }
  };

  const googleButton = (
    <>
      <button type="button" className="auth-google-btn" onClick={handleGoogle}
        disabled={loading || googleTabOpen} data-testid="auth-google">
        <svg className="auth-google-logo" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        </svg>
        {googleTabOpen ? "Finish in the browser…" : "Continue with Google"}
      </button>
      <div className="auth-divider"><span>or</span></div>
    </>
  );

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
      // Deliberately a code rather than a confirmation link. A link opens the
      // WEB app, which is pixel-identical to this one — so on Android you leave
      // the app without noticing, and end up with a session in the browser and
      // none in the app you thought you were using.
      setOtpPurpose("signup");
      setMode("otp_verify");
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
      setOtpPurpose("recovery");
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
      const signup = otpPurpose === "signup";
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: signup ? "signup" : "email",
      });
      if (error) throw error;
      // Confirming a signup returns a session, so there is nothing left to ask
      // for. A recovery code only proves the address; the password comes next.
      if (signup) onClose();
      else setMode("reset_password");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (otpPurpose !== "signup") { setMode("forgot"); setOtp(""); clearError(); return; }
    clearError();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) throw error;
      setOtp("");
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

  const goToSignIn = () => {
    setMode("signin"); setOtp(""); setNewPassword(""); setOtpPurpose("recovery"); clearError();
  };

  const title = mode === "otp_verify" && otpPurpose === "signup" ? "Confirm your email" : {
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

        {changeDone ? (
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
            {googleButton}
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
            {googleButton}
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
            <p className="auth-hint" data-testid="auth-otp-hint">
              {otpPurpose === "signup"
                ? `Enter the code we sent to ${email} to confirm your account.`
                : `Enter the code sent to ${email}.`}
            </p>
            {/* Length is not pinned to a literal: the emailed token is however
                many digits the Supabase project is configured to send, and a
                screen that demands 8 when 6 arrive can never be submitted. */}
            <input className="auth-input auth-otp-input" type="text" inputMode="numeric"
              placeholder="000000" maxLength={8} value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} required autoFocus
              data-testid="auth-otp" />
            {error && <p className="auth-error" data-testid="auth-error">{error}</p>}
            <button className="concession-btn-confirm" type="submit"
              disabled={loading || otp.length < 6} data-testid="auth-otp-submit">
              {loading ? "..." : "Verify code"}
            </button>
            <button type="button" className="auth-toggle-link" onClick={handleResendCode}
              disabled={loading} data-testid="auth-otp-resend">
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
