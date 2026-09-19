// Display helpers. Prices are stored in cents; times are shown in the business's zone (Houston).

const ZONE = "America/Chicago";

// 17500 -> "$175", 17550 -> "$175.50". Missing -> "—".
export function money(cents: number | null | undefined): string {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "—";
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}

// "9:00 AM", "Sat, Sep 26, 9:00 AM" or "Sat, Sep 26", always Houston time. Bad input -> "".
export function houstonTime(iso: unknown, style: "time" | "datetime" | "date" = "time"): string {
  if (typeof iso !== "string" && !(iso instanceof Date)) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = { weekday: "short", month: "short", day: "numeric" } as const;
  const time = { hour: "numeric", minute: "2-digit" } as const;
  const parts = style === "time" ? time : style === "date" ? date : { ...date, ...time };
  return d.toLocaleString("en-US", { timeZone: ZONE, ...parts });
}

// Judges text the demo line, so a phone is never shown in full: "+1 (713) •••-0100".
// Anything that is not a phone (a name, a lead id) comes back unchanged.
export function maskPhone(phone: unknown): string {
  if (phone == null) return "";
  const s = String(phone);
  if (!/^\+?[\d\s().-]+$/.test(s)) return s;
  const digits = s.replace(/\D/g, "");
  const us = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits.length === 10 ? digits : "";
  if (us) return `+1 (${us.slice(0, 3)}) •••-${us.slice(6)}`;
  if (digits.length >= 7 && digits.length <= 15) return `${s.startsWith("+") ? "+" : ""}••• ${digits.slice(-4)}`;
  return s;
}

// "just now", "2m ago", "3h ago", "5d ago", then the date. Future times read "in 2h".
export function timeAgo(iso: unknown): string {
  if (typeof iso !== "string" && !(iso instanceof Date)) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.round((Date.now() - then) / 1000);
  const abs = Math.abs(secs);
  if (abs < 45) return "just now";
  const [n, unit] =
    abs < 3600 ? [Math.round(abs / 60), "m"] : abs < 86400 ? [Math.round(abs / 3600), "h"] : [Math.round(abs / 86400), "d"];
  if (unit === "d" && n > 6) return houstonTime(iso, "date");
  return secs >= 0 ? `${n}${unit} ago` : `in ${n}${unit}`;
}
