"use client";

import { CalendarCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { money, houstonTime, maskPhone, timeAgo } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { useTable, type Row } from "@/lib/useTable";
import { Empty, Panel, StatusBadge } from "./Panel";

type Booking = Row & {
  phone: string | null;
  service: string;
  pet_name: string | null;
  details: { size?: string; coat?: string; addons?: string[] } | null;
  slot_id: string | null;
  total_cents: number;
  status: string;
  created_at: string;
};

const EMPTY = "No bookings yet. Text the number to book one.";

// "royal_groom" -> "Royal groom". The service key is all a booking row stores.
const serviceLabel = (key: string) => key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

// The appointment time lives on the slot. Look each slot up once; an id we cannot read is
// remembered as "" so it is not asked for again.
function useSlotTimes(bookings: Booking[]): Record<string, string> {
  const [times, setTimes] = useState<Record<string, string>>({});
  const missing = [...new Set(bookings.map((b) => b.slot_id).filter((id): id is string => !!id && !(id in times)))];
  const key = missing.join(",");

  useEffect(() => {
    if (!key) return;
    const ids = key.split(",");
    supabase
      .from("slots")
      .select("id, starts_at")
      .in("id", ids)
      .then(({ data }) => {
        const found = new Map((data ?? []).map((s) => [s.id as string, s.starts_at as string]));
        setTimes((prev) => ({ ...prev, ...Object.fromEntries(ids.map((id) => [id, found.get(id) ?? ""])) }));
      });
  }, [key]);

  return times;
}

// Overview list: pet, service and appointment on the left, price and status on the right.
export function BookingsPanel({ className }: { className?: string }) {
  const bookings = useTable<Booking>("bookings");
  const slotTimes = useSlotTimes(bookings);

  return (
    <Panel title="Bookings" count={bookings.length} className={className} flush>
      {bookings.length === 0 ? (
        <Empty icon={CalendarCheck}>{EMPTY}</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {bookings.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">
                  {b.pet_name ?? "Pet"} <span className="font-normal text-muted">· {serviceLabel(b.service)}</span>
                </p>
                <p className="truncate text-xs text-muted">
                  {houstonTime(b.slot_id ? slotTimes[b.slot_id] : null, "datetime") || "Time pending"} · {maskPhone(b.phone)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="font-semibold text-ink">{money(b.total_cents)}</span>
                <StatusBadge status={b.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// Full page: the same rows as a table.
export function BookingsTable({ className }: { className?: string }) {
  const bookings = useTable<Booking>("bookings", 200);
  const slotTimes = useSlotTimes(bookings);
  const th = "sticky top-0 z-10 border-b border-line bg-canvas px-4 py-2.5 text-left text-xs font-medium text-muted";

  return (
    <Panel title="All bookings" count={bookings.length} className={className} flush>
      {bookings.length === 0 ? (
        <Empty icon={CalendarCheck}>{EMPTY}</Empty>
      ) : (
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th className={th}>Appointment</th>
              <th className={th}>Pet</th>
              <th className={th}>Service</th>
              <th className={th}>Customer</th>
              <th className={`${th} text-right`}>Total</th>
              <th className={th}>Status</th>
              <th className={th}>Booked</th>
            </tr>
          </thead>
          <tbody className="[&_td]:border-b [&_td]:border-line [&_td]:px-4 [&_td]:py-3">
            {bookings.map((b) => (
              <tr key={b.id} className="hover:bg-canvas/60">
                <td className="font-medium whitespace-nowrap text-ink">
                  {houstonTime(b.slot_id ? slotTimes[b.slot_id] : null, "datetime") || "—"}
                </td>
                <td className="text-ink">{b.pet_name ?? "—"}</td>
                <td>
                  <p className="text-ink">{serviceLabel(b.service)}</p>
                  {b.details?.size && (
                    <p className="text-xs text-muted">
                      {[b.details.size, b.details.coat && `${b.details.coat} coat`, ...(b.details.addons ?? []).map(serviceLabel)]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </td>
                <td className="whitespace-nowrap text-muted">{maskPhone(b.phone)}</td>
                <td className="text-right font-semibold whitespace-nowrap text-ink">{money(b.total_cents)}</td>
                <td>
                  <StatusBadge status={b.status} />
                </td>
                <td className="whitespace-nowrap text-muted" title={houstonTime(b.created_at, "datetime")}>
                  {timeAgo(b.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
