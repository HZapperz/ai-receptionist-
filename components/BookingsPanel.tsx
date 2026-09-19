"use client";

import { useTable, type Row } from "@/lib/useTable";
import { Panel, time } from "./Panel";

type Booking = Row & {
  phone: string | null;
  service: string;
  pet_name: string | null;
  total_cents: number;
  status: string;
  created_at: string;
};

export function BookingsPanel() {
  const bookings = useTable<Booking>("bookings");
  return (
    <Panel title={`Bookings (${bookings.length})`}>
      <ul className="space-y-1">
        {bookings.map((b) => (
          <li key={b.id} className="flex justify-between gap-2">
            <span>
              {b.pet_name ?? "Pet"}: {b.service}
              <span className="ml-1 text-xs text-zinc-500">{b.phone}</span>
            </span>
            <span className="text-zinc-500">
              ${(b.total_cents / 100).toFixed(2)} {b.status} {time(b.created_at)}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
