import { describe, expect, it } from "vitest";
import {
  assertHonestMetric,
  collectDescriptiveTelemetry,
  normalizeLinkedInShareStats,
} from "./index.js";

describe("honest metrics", () => {
  it("accepts platform data", () => {
    expect(() => assertHonestMetric("platform")).not.toThrow();
  });

  it("rejects invented lift", () => {
    expect(() => assertHonestMetric("invented")).toThrow(/invented lift/);
  });
});

describe("descriptive telemetry", () => {
  it("does not store numeric zero when analytics are permission-limited", async () => {
    let fetched = 0;
    const snapshot = await collectDescriptiveTelemetry({
      canAnalytics: false,
      fetchStats: async () => {
        fetched += 1;
        return { httpStatus: 200, body: { impressions: 12 } };
      },
    });
    expect(fetched).toBe(0);
    expect(snapshot.dataCapability).toBe("PERMISSION_LIMITED");
    expect(snapshot.metrics.every((row) => row.value === null)).toBe(true);
    expect(
      snapshot.metrics.every((row) => row.status === "PERMISSION_DENIED"),
    ).toBe(true);
  });

  it("keeps missing adapter metrics unavailable instead of invented", () => {
    const snapshot = normalizeLinkedInShareStats({
      canAnalytics: true,
      fetchAttempted: false,
      httpStatus: null,
      body: null,
    });
    expect(snapshot.dataCapability).toBe("NOT_AVAILABLE");
    expect(snapshot.metrics.map((row) => row.status)).toEqual([
      "NOT_AVAILABLE",
      "NOT_AVAILABLE",
      "NOT_AVAILABLE",
      "NOT_AVAILABLE",
    ]);
  });

  it("observes platform counts and records a true zero", () => {
    const snapshot = normalizeLinkedInShareStats({
      canAnalytics: true,
      fetchAttempted: true,
      httpStatus: 200,
      body: { impressionCount: 40, likeCount: 0 },
    });
    expect(snapshot.metrics).toEqual([
      { metric: "impressions", value: 40, status: "OBSERVED" },
      { metric: "reactions", value: 0, status: "ZERO" },
      { metric: "comments", value: null, status: "NOT_AVAILABLE" },
      { metric: "bookmarks", value: null, status: "NOT_AVAILABLE" },
    ]);
  });
});
