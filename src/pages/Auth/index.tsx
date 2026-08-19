import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Brand } from "../../components/layout/Brand";
import { Button } from "../../components/ui/Button";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_RECOMMENDED_LENGTH, getPasswordLengthMessage } from "../../utils/passwordPolicy";

function authRedirectUrl() {
  const configuredOrigin = import.meta.env.VITE_PUBLIC_APP_URL?.trim();
  const local = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  const origin = local || !configuredOrigin ? window.location.origin : configuredOrigin;
  return new URL("/auth", origin).toString();
}

function maskEmail(value: string) {
  const [local, domain] = value.split("@");
  if (!domain || !local) return value;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(local.length - visible.length, 3))}@${domain}`;
}

const RATE_LIMIT_MESSAGE = "Too many confirmation emails were requested. Please wait a few minutes before trying again.";
function isRateLimited(error: { status?: number; code?: string; message?: string } | null) {
  if (!error) return false;
  if (error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit") return true;
  return error.status === 429 || /rate limit/i.test(error.message ?? "");
}

export function AuthPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<"signin" | "signup" | "confirmation" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [cooldown, setCooldown] = useState(0);

  const signup = mode === "signup";

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown > 0]);

  if (user) return <Navigate to={(location.state as { from?: string })?.from ?? "/dashboard"} replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    if (signup && password.length < PASSWORD_MIN_LENGTH) {
      setMessage(`Your password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }

    setBusy(true);
    const submittedEmail = email.trim();
    const result = signup
      ? await supabase.auth.signUp({ email: submittedEmail, password, options: { data: { display_name: name, full_name: name }, emailRedirectTo: authRedirectUrl() } })
      : await supabase.auth.signInWithPassword({ email: submittedEmail, password });
    setBusy(false);

    if (result.error) {
      setMessage(isRateLimited(result.error) ? RATE_LIMIT_MESSAGE : result.error.message);
      return;
    }
    if (signup) {
      setEmail(submittedEmail);
      setConfirmationEmail(submittedEmail);
      setCooldown(60);
      setMode("confirmation");
      return;
    }
    navigate("/onboarding", { replace: true });
  }

  function showMode(nextMode: "signin" | "signup" | "forgot") {
    setMode(nextMode);
    setPassword("");
    setShowPassword(false);
    setMessage("");
  }

  async function resendConfirmation() {
    if (busy || cooldown > 0) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.resend({ type: "signup", email: confirmationEmail, options: { emailRedirectTo: authRedirectUrl() } });
    setBusy(false);
    setCooldown(60);
    setMessage(isRateLimited(error) ? RATE_LIMIT_MESSAGE : error ? "We couldn't send instructions right now. Please try again in a moment." : "If confirmation is still needed, we've sent new instructions.");
  }

  async function requestPasswordReset(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const submittedEmail = email.trim();
    await supabase.auth.resetPasswordForEmail(submittedEmail, { redirectTo: authRedirectUrl() });
    setBusy(false);
    setEmail(submittedEmail);
    setMessage("If an account matches that address, we'll send password reset instructions.");
  }

  if (mode === "confirmation") return <main className="auth-page"><div className="auth-card auth-confirmation"><Brand/><p className="eyebrow">Account confirmation</p><h1>Check your email</h1><p>If this email is new, we sent a confirmation link. If you already have a Pathly account, try signing in or use Forgot password.</p><p className="confirmation-email">{maskEmail(confirmationEmail)}</p>{message && <p className={message.startsWith("We couldn't") || message.startsWith("Too many") ? "form-message" : "auth-success"} role="status">{message}</p>}<div className="auth-actions"><Button type="button" onClick={() => void resendConfirmation()} disabled={busy || cooldown > 0}>{busy ? "Sending…" : cooldown > 0 ? `Resend confirmation (${cooldown}s)` : "Resend confirmation"}</Button><Button type="button" variant="secondary" onClick={() => showMode("signin")}>Sign in instead</Button><button type="button" className="text-button" onClick={() => showMode("forgot")}>Forgot password?</button><button type="button" className="text-button" onClick={() => { setEmail(""); showMode("signup"); }}>Use a different email</button></div></div></main>;

  if (mode === "forgot") return <main className="auth-page"><div className="auth-card"><Brand/><p className="eyebrow">Account access</p><h1>Reset your password.</h1><p>Enter your email and we'll send instructions if an account matches that address.</p><form onSubmit={requestPasswordReset}><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>{message && <p className="auth-success" role="status">{message}</p>}<Button type="submit" disabled={busy}>{busy ? "Sending…" : "Send reset instructions"}</Button></form><button type="button" className="text-button" onClick={() => showMode("signin")}>Back to sign in</button></div></main>;

  return <main className="auth-page"><div className="auth-card"><Brand/><p className="eyebrow">Welcome to Pathly</p><h1>{signup ? "Create your calm space." : "Good to see you."}</h1><form onSubmit={submit}>{signup && <label>Display name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required /></label>}<label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label><label>Password<div className="password-field"><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={signup ? PASSWORD_MIN_LENGTH : undefined} maxLength={signup ? PASSWORD_MAX_LENGTH : undefined} autoComplete={signup ? "new-password" : "current-password"} autoCapitalize="none" spellCheck={false} aria-describedby={signup ? "password-guidance" : undefined} required /><button type="button" className="password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={`${showPassword ? "Hide" : "Show"} password`} aria-pressed={showPassword}>{showPassword ? "Hide" : "Show"}</button></div>{signup && <small id="password-guidance" className={password.length >= PASSWORD_RECOMMENDED_LENGTH ? "password-guidance is-strong" : "password-guidance"}>{password ? getPasswordLengthMessage(password) : `${PASSWORD_MIN_LENGTH} characters minimum; ${PASSWORD_RECOMMENDED_LENGTH}+ recommended. Spaces and passphrases are welcome.`}</small>}</label>{message && <p className="form-message" role="alert">{message}</p>}<Button type="submit" disabled={busy}>{busy ? "One moment…" : signup ? "Create account" : "Sign in"}</Button></form><button type="button" className="text-button" onClick={() => showMode(signup ? "signin" : "signup")}>{signup ? "Already have an account? Sign in" : "New here? Create an account"}</button>{!signup && <button type="button" className="text-button auth-forgot" onClick={() => showMode("forgot")}>Forgot password?</button>}</div></main>;
}
