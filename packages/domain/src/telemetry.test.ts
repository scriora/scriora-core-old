import { describe, expect, it } from "vitest";
import { dueTelemetrySlots, isTelemetryPollSlot } from "./index.js";

describe("telemetry slots", () => {
  it("opens degradation windows after publish time", () => {
    const publishedAt = new Date("2026-09-10T00:00:00.000Z");
    expect(
      dueTelemetrySlots(publishedAt, new Date("2026-09-10T01:00:00.000Z")),
    ).toEqual([]);
    expect(
      dueTelemetrySlots(publishedAt, new Date("2026-09-10T02:00:00.000Z")),
    ).toEqual(["t_plus_2h"]);
    expect(
      dueTelemetrySlots(publishedAt, new Date("2026-09-17T00:00:00.000Z")),
    ).toEqual([
      "t_plus_2h",
      "t_plus_6h",
      "t_plus_12h",
      "t_plus_24h",
      "t_plus_48h",
      "t_plus_7d",
    ]);
  });

  it("accepts manual and scheduled slot ids", () => {
    expect(isTelemetryPollSlot("manual")).toBe(true);
    expect(isTelemetryPollSlot("t_plus_24h")).toBe(true);
    expect(isTelemetryPollSlot("zscore")).toBe(false);
  });
});
