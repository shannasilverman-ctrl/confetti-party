import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CalendarActions } from "@/components/calendar-actions";

const base = {
  name: "Neighborhood dinner",
  date: "2027-05-22",
  location: "Community garden",
};

describe("CalendarActions", () => {
  it("fails closed when a timed invitation has no confirmed event zone", () => {
    render(<CalendarActions party={{ ...base, start_time: "6:30 PM" }} />);

    expect(screen.queryByRole("link", { name: /Google Calendar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Apple \/ .ics/i })).not.toBeInTheDocument();
    expect(screen.getByTestId("calendar-time-zone-warning")).toHaveTextContent(
      "Ask the host to confirm the event time zone",
    );
    expect(screen.getByRole("link", { name: /Directions/i })).toBeInTheDocument();
  });

  it("keeps date-only invitations exportable without a zone", () => {
    render(<CalendarActions party={{ ...base, start_time: null }} />);

    expect(screen.getByRole("link", { name: /Google Calendar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Apple \/ .ics/i })).toBeInTheDocument();
    expect(screen.queryByTestId("calendar-time-zone-warning")).not.toBeInTheDocument();
  });
});
