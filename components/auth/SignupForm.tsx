"use client";

import { MailCheck } from "lucide-react";
import { useActionState, useState } from "react";
import { Button, Input, Label } from "@/components/ui";
import { signUp } from "@/lib/auth-actions";
import { FormError, PasswordInput, SubmitButton } from "./fields";

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signUp, undefined);
  // React resets the form after each submit; keep what was typed so an error does not wipe it.
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  // With "Confirm email" on, Supabase sends a link instead of signing the user in.
  if (state?.message) {
    return (
      <div className="animate-fade-up space-y-5 rounded-xl border border-line bg-canvas p-6 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-brand-soft text-brand">
          <MailCheck className="size-6" />
        </span>
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold tracking-tight">Check your inbox</h2>
          <p className="text-sm text-muted">{state.message}</p>
          {email && <p className="text-sm font-medium text-ink">{email}</p>}
        </div>
        <Button href="/login" variant="outline" className="w-full">
          Go to sign in
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="name">Your name</Label>
        <Input
          id="name"
          name="name"
          autoComplete="name"
          placeholder="Alex Rivera"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">Work email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@business.com"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <PasswordInput id="password" name="password" autoComplete="new-password" minLength={8} required aria-describedby="password-hint" />
        <p id="password-hint" className="text-xs text-muted">
          At least 8 characters.
        </p>
      </div>
      <FormError>{state?.error}</FormError>
      <SubmitButton pending={pending} label="Create account" pendingLabel="Creating your account…" />
    </form>
  );
}
