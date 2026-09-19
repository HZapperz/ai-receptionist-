"use client";

import { Check, Info, LoaderCircle, Mail, MessageSquareText, Phone } from "lucide-react";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Badge, cn } from "@/components/ui";
import { maskPhone } from "@/lib/format";

function Status({ live }: { live: boolean }) {
  return live ? (
    <Badge tone="success" className="animate-fade-up">
      <Check />
      Connected
    </Badge>
  ) : (
    <Badge tone="warning">
      <LoaderCircle className="animate-spin" />
      Connecting…
    </Badge>
  );
}

function Channel({ icon: Icon, title, live, right, children }: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  live?: boolean;
  right: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-4 rounded-xl border p-4 transition-colors duration-500",
        live ? "border-emerald-200 bg-emerald-50/40" : "border-line bg-white",
      )}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-muted">{children}</p>
      </div>
      <div className="shrink-0">{right}</div>
    </div>
  );
}

// Step 3. Simulated: the timers flip the cards to Connected. Nothing is called and the number is not touched.
export function ChannelsStep({ phone, email }: { phone: string; email?: string }) {
  const [live, setLive] = useState({ sms: false, email: false });

  useEffect(() => {
    const sms = setTimeout(() => setLive((l) => ({ ...l, sms: true })), 1600);
    const mail = setTimeout(() => setLive((l) => ({ ...l, email: true })), 2600);
    return () => {
      clearTimeout(sms);
      clearTimeout(mail);
    };
  }, []);

  const masked = maskPhone(phone);

  return (
    <div className="space-y-4">
      <Channel icon={Phone} title="Business number" right={<Badge>Keep your number</Badge>}>
        <span className="font-medium text-ink tabular-nums">{masked || "Not set yet"}</span>. Customers keep texting
        the number they already know.
      </Channel>
      <Channel icon={MessageSquareText} title="Texting" live={live.sms} right={<Status live={live.sms} />}>
        Your AI receptionist answers texts to {masked || "your business number"} in seconds, day or night.
      </Channel>
      <Channel icon={Mail} title="Email sender" live={live.email} right={<Status live={live.email} />}>
        Outreach goes out from {email || "your work email"}, and only after you click Send.
      </Channel>
      <p className="flex items-center gap-2 pt-2 text-xs text-muted">
        <Info className="size-3.5 shrink-0" />
        Demo setup: these connections are simulated.
      </p>
    </div>
  );
}
