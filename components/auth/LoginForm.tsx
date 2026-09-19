"use client";

import { useActionState, useState } from "react";
import { Input, Label } from "@/components/ui";
import { signIn } from "@/lib/auth-actions";
import { FormError, PasswordInput, SubmitButton } from "./fields";

// next is the page proxy.ts bounced the visitor from; signIn only honors /dashboard paths.
export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(signIn, undefined);
  // React resets the form after each submit; keeping the email in state saves retyping it after an error.
  const [email, setEmail] = useState("");

  return (
    <form action={formAction} className="space-y-5">
      {next && <input type="hidden" name="next" value={next} />}
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@business.com"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <PasswordInput id="password" name="password" autoComplete="current-password" required />
      </div>
      <FormError>{state?.error}</FormError>
      <SubmitButton pending={pending} label="Sign in" pendingLabel="Signing in…" />
    </form>
  );
}
