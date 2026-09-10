import { describe, expect, it } from "vitest";
import { inspectOAuthPending, oauthStateTtlMs } from "./index.js";

describe("oauth pending state", () => {
  const expiresAt = new Date(1_000_000 + oauthStateTtlMs);

  it("accepts a fresh unused state", () => {
    expect(
      inspectOAuthPending({
        consumedAt: null,
        expiresAt,
        now: new Date(1_000_000),
      }),
    ).toBe("ok");
  });

  it("rejects expiry and reuse", () => {
    expect(
      inspectOAuthPending({
        consumedAt: null,
        expiresAt,
        now: expiresAt,
      }),
    ).toBe("expired");
    expect(
      inspectOAuthPending({
        consumedAt: new Date(1_000_001),
        expiresAt,
        now: new Date(1_000_000),
      }),
    ).toBe("reused");
  });
});
