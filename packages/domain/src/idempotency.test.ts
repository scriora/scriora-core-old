import { describe, expect, it } from "vitest";
import { decideIdempotency } from "./index.js";

describe("publish idempotency", () => {
  it("reserves when no attempt exists", () => {
    expect(decideIdempotency(null, "fp-a")).toEqual({ kind: "reserve" });
  });

  it("replays the same key and fingerprint", () => {
    const attempt = {
      id: "att-1",
      fingerprint: "fp-a",
      status: "RESERVED" as const,
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
});
