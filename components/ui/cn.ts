// Joins class names and drops the falsy ones. It does not merge conflicts: to override a
// component's default (say its padding), use Tailwind's important suffix, e.g. "p-0!".
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
