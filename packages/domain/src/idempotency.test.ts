import { describe, expect, it } from "vitest";
import {
  decideIdempotency,
  finalizePublishStatus,
  observeLinkedInCreate,
  outboxFollowUp,
  retryDelayMs,
} from "./index.js";

describe("publish idempotency", () => {
  it("reserves when no attempt exists", () => {
    expect(decideIdempotency(null, "fp-a")).toEqual({ kind: "reserve" });
  });

  it("dispatches a reserved attempt once", () => {
    const attempt = {
      id: "att-1",
      fingerprint: "fp-a",
      status: "RESERVED" as const,
    };
    expect(decideIdempotency(attempt, "fp-a")).toEqual({
      kind: "dispatch",
      attempt,
    });
  });

  it("replays a terminal attempt", () => {
    const attempt = {
      id: "att-1",
      fingerprint: "fp-a",
      status: "SUCCEEDED" as const,
    };
    expect(decideIdempotency(attempt, "fp-a")).toEqual({
      kind: "replay",
      attempt,
    });
  });

  it("conflicts when the same key has a different fingerprint", () => {
    expect(
      decideIdempotency(
        { id: "att-1", fingerprint: "fp-a", status: "RESERVED" },
        "fp-b",
      ),
    ).toEqual({ kind: "conflict", status: 409 });
  });

  it("reconciles only after unknown_external_state", () => {
    const attempt = {
      id: "att-1",
      fingerprint: "fp-a",
      status: "UNKNOWN_EXTERNAL_STATE" as const,
    };
    expect(decideIdempotency(attempt, "fp-a")).toEqual({
      kind: "reconcile_only",
      attempt,
    });
  });

  it("verifies pending attempts without creating again", () => {
    expect(
      decideIdempotency(
        {
          id: "att-1",
          fingerprint: "fp-a",
          status: "PLATFORM_PENDING",
        },
        "fp-a",
      ).kind,
    ).toBe("reconcile_only");
  });

  it("does not create again while dispatching", () => {
    const attempt = {
      id: "att-1",
      fingerprint: "fp-a",
      status: "DISPATCHING" as const,
    };
    expect(decideIdempotency(attempt, "fp-a").kind).toBe("reconcile_only");
  });

  it("does not treat HTTP 201 as succeeded without a verified id", () => {
    const created = observeLinkedInCreate(201, "urn:li:share:1");
    expect(
      finalizePublishStatus({ create: created, verify: "pending" }).status,
    ).toBe("PLATFORM_PENDING");
    expect(
      finalizePublishStatus({ create: created, verify: "verified" }).status,
    ).toBe("SUCCEEDED");
    expect(
      finalizePublishStatus({
        create: observeLinkedInCreate(201, null),
        verify: null,
      }).status,
    ).toBe("UNKNOWN_EXTERNAL_STATE");
  });
});

describe("outbox retry", () => {
  it("uses full jitter under the 30s/2m/8m caps", () => {
    expect(retryDelayMs(1, () => 0)).toBe(0);
    expect(retryDelayMs(1, () => 0.5)).toBe(15_000);
    expect(retryDelayMs(2, () => 1)).toBe(120_000);
    expect(retryDelayMs(3, () => 0.25)).toBe(120_000);
  });

  it("does not retry create after unknown or permanent failure", () => {
    expect(outboxFollowUp("UNKNOWN_EXTERNAL_STATE", 1)).toBe("dead");
    expect(outboxFollowUp("FAILED_PERMANENT", 1)).toBe("dead");
    expect(outboxFollowUp("RESERVED", 1)).toBe("retry");
    expect(outboxFollowUp("RESERVED", 3)).toBe("dead");
    expect(outboxFollowUp("PLATFORM_PENDING", 1)).toBe("delivered");
  });
});
