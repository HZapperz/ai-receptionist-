import { CalendarCheck, ChartBar, MessageSquareText, Telescope } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { EXAMPLE_CONFIGS } from "@/lib/example-configs";
import { money } from "@/lib/format";

const AGENTS = [
  { icon: MessageSquareText, name: "Receptionist", does: "Answers every text, quotes from your price list and books open slots." },
  { icon: Telescope, name: "Prospector", does: "Finds local partners and drafts outreach. Nothing sends until you click." },
  { icon: ChartBar, name: "Manager", does: "Tells you what happened today and hands work to the others." },
];

// The example thread quotes the showcase's real price list, so the numbers match what the agent would say.
const showcase = EXAMPLE_CONFIGS[0].config as {
  services: { label: string; base_cents: Record<string, number> }[];
  coat_surcharge_cents: Record<string, number>;
};
const groom = showcase.services[0];
const price = money(groom.base_cents.medium + showcase.coat_surcharge_cents.long);

// Right half of the login and signup pages: what the product is, in one glance. No testimonials.
export function BrandPanel() {
  return (
    <aside className="relative overflow-hidden bg-linear-to-br from-brand via-indigo-600 to-violet-700 px-6 py-12 text-white sm:px-12 lg:py-16">
      <div
        aria-hidden="true"
        className="absolute inset-0 [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]"
        style={{ backgroundImage: "radial-gradient(rgb(255 255 255 / 0.18) 1px, transparent 1px)", backgroundSize: "20px 20px" }}
      />
      <div aria-hidden="true" className="absolute -bottom-32 -left-24 size-96 rounded-full bg-violet-400/30 blur-3xl" />

      <div className="relative mx-auto flex h-full max-w-md flex-col justify-center gap-10">
        <div className="space-y-4">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/90 ring-1 ring-white/20 ring-inset">
            {BRAND.tagline}
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-balance lg:text-4xl">
            Answer every text. Fill every slot. Find the next customer.
          </h2>
          <p className="text-base text-white/75">
            Three AI agents share one memory of your business and hand work to each other, so nothing falls through.
          </p>
        </div>

        <ul className="space-y-4">
          {AGENTS.map(({ icon: Icon, name, does }) => (
            <li key={name} className="flex gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/10 ring-1 ring-white/20 ring-inset">
                <Icon className="size-4.5" />
              </span>
              <div>
                <p className="font-medium">{name}</p>
                <p className="text-sm text-white/70">{does}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="hidden rounded-xl bg-white p-4 text-ink shadow-lift sm:block">
          <div className="mb-3 flex items-center justify-between text-xs">
            <span className="font-medium text-muted">{BRAND.showcase} · text thread</span>
            <span className="rounded-full bg-canvas px-2 py-0.5 font-medium text-muted ring-1 ring-line ring-inset">Example</span>
          </div>
          <div className="space-y-2 text-sm">
            <p className="w-fit max-w-[85%] rounded-2xl rounded-bl-sm bg-canvas px-3 py-2">How much for a medium doodle with a long coat?</p>
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-brand px-3 py-2 text-white">
              A {groom.label} for a medium dog with a long coat is {price} before tax. I have Saturday at 9:00 AM. Want it?
            </p>
          </div>
          <div className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-xs text-muted">
            <CalendarCheck className="size-4 text-emerald-600" />
            <span>
              <span className="font-medium text-ink">Booked:</span> {groom.label}, Sat 9:00 AM, {price}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
