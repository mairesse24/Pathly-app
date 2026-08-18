import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Brand } from "../../components/layout/Brand";
import { Button } from "../../components/ui/Button";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";

const RESEND_COOLDOWN_SECONDS = 30;

function confirmationRedirectUrl() {
  return new URL("/auth", window.location.origin).toString();
}

export function AuthPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Capture the confirmation-link "type" before Supabase's own session
  // detection strips it from the URL, so we can show a real success
  // screen instead of silently redirecting the user away.
  const [justConfirmedSignup] = useState(() => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const searchParams = new URLSearchParams(window.location.search);
    return (hashParams.get("type") ?? searchParams.get("type")) === "signup";
  });

  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => setResendCooldown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  if (user && justConfirmedSignup) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <Brand />
          <p className="eyebrow">You're confirmed</p>
          <h1>Your email is confirmed.</h1>
          <p>You're signed in to Pathly. Let's finish setting up your account.</p>
          <Button type="button" onClick={() => navigate("/onboarding", { replace: true })}>Continue to Pathly</Button>
        </div>
      </main>
    );
  }

  if (user) return <Navigate to={(location.state as { from?: string })?.from ?? "/dashboard"} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    const submittedEmail = email.trim();
    const result = signup
      ? await supabase.auth.signUp({
          email: submittedEmail,
          password,
          options: { data: { display_name: name, full_name: name }, emailRedirectTo: confirmationRedirectUrl() },
        })
      : await supabase.auth.signInWithPassword({ email: submittedEmail, password });
    setBusy(false);
    if (result.error) return setMessage(result.error.message);
    if (signup && !result.data.session) {
      setEmail(submittedEmail);
      setPendingConfirmation(true);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      return;
    }
    navigate("/onboarding", { replace: true });
  }

  async function resendConfirmation() {
    if (busy || resendCooldown > 0 || !email) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: confirmationRedirectUrl() } });
    setBusy(false);
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    setMessage(error ? "We couldn't resend the email right now. Please try again shortly." : "Confirmation email sent. Check your inbox (and spam folder).");
  }

  if (pendingConfirmation) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <Brand />
          <p className="eyebrow">Almost there</p>
          <h1>Check your email to confirm your Pathly account.</h1>
          <p>We've sent instructions to <strong>{email}</strong>. Click the link in that email to finish setting up your account, then come back here to sign in.</p>
          {message && <p className="form-message" role="status">{message}</p>}
          <Button type="button" onClick={() => void resendConfirmation()} disabled={busy || resendCooldown > 0}>
            {resendCooldown > 0 ? `Resend email (${resendCooldown}s)` : busy ? "Sending…" : "Resend confirmation email"}
          </Button>
          <button className="text-button" onClick={() => { setPendingConfirmation(false); setSignup(false); setMessage(""); }}>Back to sign in</button>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <Brand />
        <p className="eyebrow">Welcome to Pathly</p>
        <h1>{signup ? "Create your calm space." : "Good to see you."}</h1>
        <form onSubmit={submit}>
          {signup && <label>Display name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>}
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required /></label>
          {message && <p className="form-message">{message}</p>}
          <Button type="submit" disabled={busy}>{busy ? "One moment…" : signup ? "Create account" : "Sign in"}</Button>
        </form>
        <button className="text-button" onClick={() => { setSignup(!signup); setMessage(""); }}>{signup ? "Already have an account? Sign in" : "New here? Create an account"}</button>
      </div>
    </main>
  );
}
