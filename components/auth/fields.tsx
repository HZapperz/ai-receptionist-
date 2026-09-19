"use client";

import { CircleAlert, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Button, Input } from "@/components/ui";

// Form pieces shared by the login and signup forms.

export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={shown ? "text" : "password"} className="pr-10" />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 grid w-10 cursor-pointer place-items-center rounded-r-lg text-muted transition-colors hover:text-ink focus-visible:text-ink focus-visible:outline-none"
      >
        {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="flex animate-fade-up items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
      {children}
    </p>
  );
}

export function SubmitButton({ pending, label, pendingLabel }: { pending: boolean; label: string; pendingLabel: string }) {
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending} aria-disabled={pending}>
      {pending && <LoaderCircle className="animate-spin" />}
      {pending ? pendingLabel : label}
    </Button>
  );
}
