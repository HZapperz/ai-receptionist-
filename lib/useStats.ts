"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export type Stats = {
  textsIn: number;
  textsOut: number;
  bookings: number;
  revenueCents: number;
  leads: { new: number; drafted: number; sent: number; replied: number };
  escalations: number;
  activeSessions: number;
};

const LEAD_STATUSES = ["new", "drafted", "sent", "replied"] as const;
const WATCHED = ["messages", "bookings", "leads", "agent_events"];

// Each hook gets its own channel name, so two KPI strips never collide.
let channelCount = 0;

// Today starts at midnight in Houston, not in the viewer's zone or UTC.
function houstonMidnight(): string {
  const now = new Date();
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(now)
      .map((part) => [part.type, Number(part.value)]),
  );
  // Houston's wall clock read as if it were UTC, minus the real time, is the zone offset (-5h or -6h).
  const offset = Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - now.getTime()) / 60000) * 60000;
  return new Date(Date.UTC(p.year, p.month - 1, p.day) - offset).toISOString();
}

async function loadStats(): Promise<Stats> {
  const since = houstonMidnight();
  const head = { count: "exact", head: true } as const;
  const [textsIn, textsOut, bookings, escalations, sessions, ...leads] = await Promise.all([
    supabase.from("messages").select("*", head).eq("direction", "in").gte("created_at", since),
    supabase.from("messages").select("*", head).eq("direction", "out").gte("created_at", since),
    supabase.from("bookings").select("total_cents").eq("status", "confirmed"),
    supabase.from("agent_events").select("*", head).eq("name", "escalate").gte("created_at", since),
    supabase.from("ai_sessions").select("*", head).is("ended_at", null).gt("expires_at", new Date().toISOString()),
    ...LEAD_STATUSES.map((s) => supabase.from("leads").select("*", head).eq("status", s)),
  ]);
  const booked = (bookings.data ?? []) as { total_cents: number }[];
  return {
    textsIn: textsIn.count ?? 0,
    textsOut: textsOut.count ?? 0,
    bookings: booked.length,
    revenueCents: booked.reduce((sum, b) => sum + (b.total_cents ?? 0), 0),
    leads: { new: leads[0].count ?? 0, drafted: leads[1].count ?? 0, sent: leads[2].count ?? 0, replied: leads[3].count ?? 0 },
    escalations: escalations.count ?? 0,
    activeSessions: sessions.count ?? 0,
  };
}

// Headline numbers for the Overview. Counted in the database (head requests), refetched shortly
// after any Realtime change and every 30 s (ai_sessions is not in the Realtime publication). null while loading.
export function useStats(): Stats | null {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      loadStats()
        .then((s) => {
          if (!cancelled) setStats(s);
        })
        .catch(() => {}); // keep the last numbers; the next change or poll tries again
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(load, 500);
    };

    load();
    const poll = setInterval(load, 30_000);
    channelCount += 1;
    const channel = supabase.channel(`stats-${channelCount}`);
    for (const table of WATCHED) channel.on("postgres_changes", { event: "*", schema: "public", table }, soon);
    channel.subscribe();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, []);

  return stats;
}
