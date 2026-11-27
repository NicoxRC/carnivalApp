import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EtaBar } from "@/components/EtaBar";
import type { Eta } from "@/lib/eta";
import { setLanguage } from "@/lib/i18n";

const CASES: [Eta, string, string][] = [
  [
    { kind: "arriving", minMin: 20, maxMin: 35, distanceM: 2100, speedKmh: 1.5, speedMeasured: true, notMovingMin: null, tailIn: null },
    "El desfile te cae en",
    "The parade reaches you in",
  ],
  [{ kind: "stopped", distanceM: 1400, stoppedForMin: 12 }, "El desfile está parado", "The parade has stopped"],
  [{ kind: "no_signal", distanceM: 900, agoMin: 8 }, "Sin noticias del desfile hace 8 min", "No news from the parade for 8 min"],
  [{ kind: "here", distanceM: 80, tailIn: null }, "¡Ya te está pasando por delante!", "It's passing right in front of you!"],
  [
    { kind: "passed", headDistanceM: 1500, tailDistanceM: 300, tailPassed: true, tailIn: null },
    "Ya pasó todo por donde estás",
    "The whole parade has passed your spot",
  ],
  [
    { kind: "passed", headDistanceM: 620, tailDistanceM: 470, tailPassed: false, tailIn: null },
    "La cabeza ya pasó",
    "The front has passed",
  ],
  [{ kind: "no_data", reason: "no_location" }, "¿En qué parte estás?", "Where are you standing?"],
  [{ kind: "no_data", reason: "off_course" }, "Estás lejos de la senda", "You're far from the route"],
  [{ kind: "no_data", reason: "no_report" }, "El desfile todavía no arranca", "The parade hasn't started yet"],
];

function show(eta: Eta) {
  return render(
    <EtaBar
      eta={eta}
      state={null}
      connection="live"
      now={Date.now()}
      userMetres={eta.kind === "no_data" ? null : 1000}
      onRequestLocation={() => undefined}
      onPickPoint={() => undefined}
    />,
  );
}

describe("EtaBar", () => {
  it.each(CASES)("says each state of the ETA in Spanish and in English (%#)", (eta, spanish, english) => {
    act(() => setLanguage("es"));
    const { unmount } = show(eta);
    expect(screen.getByText(spanish, { exact: false })).toBeTruthy();
    unmount();

    act(() => setLanguage("en"));
    show(eta);
    expect(screen.getByText(english, { exact: false })).toBeTruthy();
  });

  it("never gives an exact minute: the arrival is a range", () => {
    act(() => setLanguage("es"));
    show(CASES[0][0]);
    expect(screen.getByText("20–35 min")).toBeTruthy();
  });

  it("asks for the location only when it is the location that is missing", () => {
    act(() => setLanguage("es"));
    const { unmount } = show({ kind: "no_data", reason: "no_location" });
    expect(screen.getByRole("button", { name: "Usar mi ubicación" })).toBeTruthy();
    unmount();
    show({ kind: "no_data", reason: "no_report" });
    expect(screen.queryByRole("button", { name: "Usar mi ubicación" })).toBeNull();
  });
});
