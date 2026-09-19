"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export type Row = { id: string | number } & Record<string, unknown>;

// Each subscription gets its own channel name, so two hooks on the same table don't collide.
let channelCount = 0;

// Load the latest rows of a table, then keep them fresh with Supabase Realtime.
export function useTable<T extends Row = Row>(table: string, limit = 50, orderBy = "created_at"): T[] {
  const [rows, setRows] = useState<T[]>([]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from(table)
      .select("*")
      .order(orderBy, { ascending: false })
      .limit(limit)
      .then(({ data }) => {
        if (!cancelled && data) setRows(data as T[]);
      });

    channelCount += 1;
    const channel = supabase
      .channel(`table-${table}-${channelCount}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
        if (payload.eventType === "INSERT") {
          const row = payload.new as T;
          setRows((prev) => [row, ...prev.filter((r) => r.id !== row.id)].slice(0, limit));
        } else if (payload.eventType === "UPDATE") {
          const row = payload.new as T;
          setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)));
        } else if (payload.eventType === "DELETE") {
          const old = payload.old as Partial<T>;
          setRows((prev) => prev.filter((r) => r.id !== old.id));
        }
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [table, limit, orderBy]);

  return rows;
}
