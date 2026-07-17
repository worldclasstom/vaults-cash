"use client";

import { createContext, useContext, useState } from "react";
import {
  useIsInitialized,
  useIsSignedIn,
  useSignInWithEmail,
  useSignOut,
  useVerifyEmailOTP,
} from "@coinbase/cdp-hooks";

/**
 * Thin auth shim over CDP.
 *
 * CDP ships an <AuthButton>, but our buttons ("Get started", "Start earning",
 * the Log in pill) are part of the design, so instead we expose a Privy-shaped
 * `{ ready, authenticated, login, logout }` and render our own email-OTP sheet.
 * Every CDP auth call lives in this file; the rest of the app never imports
 * cdp-hooks for auth.
 */
type AuthValue = {
  ready: boolean;
  authenticated: boolean;
  login: () => void;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isInitialized } = useIsInitialized();
  const { isSignedIn } = useIsSignedIn();
  const { signOut } = useSignOut();
  const [open, setOpen] = useState(false);

  return (
    <Ctx.Provider
      value={{
        ready: isInitialized,
        authenticated: isSignedIn,
        login: () => setOpen(true),
        logout: async () => {
          await signOut();
        },
      }}
    >
      {children}
      {open && !isSignedIn && <SignInSheet onClose={() => setOpen(false)} />}
    </Ctx.Provider>
  );
}

function SignInSheet({ onClose }: { onClose: () => void }) {
  const { signInWithEmail } = useSignInWithEmail();
  const { verifyEmailOTP } = useVerifyEmailOTP();

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [flowId, setFlowId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      const { flowId } = await signInWithEmail({ email: email.trim() });
      setFlowId(flowId);
    } catch (e) {
      setError((e as Error).message || "Couldn't send that code. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!flowId) return;
    setBusy(true);
    setError(null);
    try {
      await verifyEmailOTP({ flowId, otp: otp.trim() });
      onClose(); // signed in — provider flips authenticated
    } catch (e) {
      setError((e as Error).message || "That code didn't work. Try again.");
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
      onClick={() => !busy && onClose()}
    >
      <div
        className="w-full max-w-md animate-rise rounded-t-3xl bg-surface-raised p-6 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {!flowId ? (
          <>
            <h3 className="text-lg font-semibold">Log in to vaults.cash</h3>
            <p className="pt-1 text-sm text-muted">
              We&apos;ll email you a code. No password, no seed phrase — a secure
              wallet is created for you.
            </p>
            <input
              type="email"
              inputMode="email"
              autoFocus
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && emailValid && !busy && sendCode()}
              className="mt-4 w-full rounded-xl bg-surface p-3 outline-none placeholder:text-muted/50"
            />
            <button
              onClick={sendCode}
              disabled={!emailValid || busy}
              className="mt-3 w-full rounded-full bg-accent py-3 font-semibold text-black transition-colors hover:bg-accent-strong disabled:opacity-40"
            >
              {busy ? "Sending…" : "Continue"}
            </button>
          </>
        ) : (
          <>
            <h3 className="text-lg font-semibold">Enter your code</h3>
            <p className="pt-1 text-sm text-muted">
              We sent a code to <span className="text-foreground">{email.trim()}</span>.
            </p>
            <input
              inputMode="numeric"
              autoFocus
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && otp.length >= 6 && !busy && verify()}
              className="mt-4 w-full rounded-xl bg-surface p-3 text-center font-mono text-2xl tracking-[0.3em] outline-none placeholder:text-muted/30"
            />
            <button
              onClick={verify}
              disabled={otp.length < 6 || busy}
              className="mt-3 w-full rounded-full bg-accent py-3 font-semibold text-black transition-colors hover:bg-accent-strong disabled:opacity-40"
            >
              {busy ? "Verifying…" : "Log in"}
            </button>
            <button
              onClick={() => {
                setFlowId(null);
                setOtp("");
                setError(null);
              }}
              disabled={busy}
              className="mt-2 w-full py-1 text-xs text-muted transition-colors hover:text-foreground disabled:opacity-40"
            >
              Use a different email
            </button>
          </>
        )}
        {error && <p className="pt-3 text-xs text-negative">{error}</p>}
      </div>
    </div>
  );
}
