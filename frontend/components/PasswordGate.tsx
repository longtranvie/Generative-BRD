"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { checkAuth, storeToken } from "@/lib/api";

export default function PasswordGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState<boolean>(false);
  const [checked, setChecked] = useState<boolean>(false);
  const [input, setInput] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // The password is enforced by the backend (APP_PASSWORD env). On mount we
  // probe it: no password configured, or a previously stored token is still
  // valid -> straight through.
  useEffect(() => {
    let cancelled = false;
    checkAuth()
      .then((r) => {
        if (!cancelled && (!r.auth_required || r.ok)) setUnlocked(true);
      })
      .catch(() => {
        /* backend unreachable — keep the gate up; submit will surface it */
      })
      .finally(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Avoid a brief flash of the gate while we probe the backend.
  if (!checked) return null;
  if (unlocked) return <>{children}</>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const r = await checkAuth(input);
      if (!r.auth_required || r.ok) {
        storeToken(input);
        setUnlocked(true);
      } else {
        setError("Wrong password.");
      }
    } catch {
      setError("Could not reach the backend to verify the password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative z-10 min-h-screen flex items-center justify-center px-6">
      <form
        onSubmit={submit}
        className="card p-8 max-w-sm w-full shadow-lg"
        autoComplete="off"
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-cyan-600 flex items-center justify-center text-white font-black text-base">
            B
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-black tracking-tightest text-[1.05rem]">BRD Agent</span>
            <span className="text-[0.7rem] text-muted font-medium">app · locked</span>
          </div>
        </div>

        <p className="text-sm text-muted leading-relaxed mb-5">
          This demo is password-protected so people can't burn through the
          OpenAI key. Enter the password to continue — or head back to the
          overview to read about the agent without running it.
        </p>

        <input
          type="password"
          className={
            "w-full border rounded-btn p-3 text-sm focus:outline-none focus:ring-2 transition " +
            (error
              ? "border-red-300 focus:border-red-400 focus:ring-red-200"
              : "border-line focus:border-accent focus:ring-accent/15")
          }
          placeholder="Password"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
          }}
          autoFocus
        />
        {error && (
          <div className="mt-2 text-xs text-danger font-semibold">{error}</div>
        )}

        <button
          type="submit"
          className="btn-cta w-full justify-center mt-4"
          disabled={submitting}
        >
          {submitting ? "Checking…" : "Unlock →"}
        </button>

        <div className="mt-5 pt-4 border-t border-line text-center">
          <Link
            href="/home"
            className="text-[0.78rem] text-muted hover:text-accent transition"
          >
            ← back to overview
          </Link>
        </div>
      </form>
    </main>
  );
}
