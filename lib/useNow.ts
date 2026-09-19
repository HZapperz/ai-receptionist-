"use client";

import { useSyncExternalStore } from "react";

const STEP = 30_000;

function subscribe(onChange: () => void) {
  const id = setInterval(onChange, STEP);
  return () => clearInterval(id);
}

// The time, rounded down to 30 s so it stays the same between renders. 0 on the server.
// For "is this upcoming / from today" checks that should roll over while the page stays open.
export function useNow(): number {
  return useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / STEP) * STEP,
    () => 0,
  );
}
