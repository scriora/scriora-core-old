import { describe, expect, it } from "vitest";
import { foldPreview } from "./preview-fold.js";
import { telemetryValueLabel } from "./telemetry-copy.js";
import { dayKeyInTimeZone, wallClockToUtc } from "./timezone.js";

describe("classic LinkedIn fold", () => {
  it("keeps 210 characters above see more", () => {
    const long = "a".repeat(220);
    const fold = foldPreview(long);
    expect(fold.visible).toHaveLength(210);
    expect(fold.overflow).toHaveLength(10);
  });
});

describe("classic telemetry copy", () => {
  it("shows observed values and hides unknown ones", () => {
    expect(
      telemetryValueLabel({
        value: 40,
        status: "OBSERVED",
        unavailable: "not available",
      }),
    ).toBe("40");
    expect(
      telemetryValueLabel({
        value: null,
        status: "UNKNOWN",
        unavailable: "not available",
      }),
    ).toBe("not available");
  });
});

describe("classic timezone", () => {
  it("stores wall time as UTC", () => {
    const iso = wallClockToUtc("2026-01-15T06:30", "America/New_York");
    expect(iso).toBe("2026-01-15T11:30:00.000Z");
    expect(dayKeyInTimeZone(iso, "America/New_York")).toBe("2026-01-15");
  });
});
