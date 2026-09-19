import { BookingsTable } from "@/components/BookingsPanel";
import { PageHeader } from "@/components/dashboard/PageHeader";

export default function BookingsPage() {
  return (
    <div className="flex h-full flex-col gap-5 p-6">
      <PageHeader
        title="Bookings"
        description="Appointments the AI booked by text. Every total is priced in code from your price list. Times are Houston time."
      />
      <BookingsTable className="flex-1" />
    </div>
  );
}
