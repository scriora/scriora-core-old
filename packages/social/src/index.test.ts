import { describe, expect, it } from "vitest";
import {
  canRetryProviderCreate,
  httpCreatedIsNotPublished,
  linkedinCapabilityManifest,
  ProviderError,
} from "./index.js";

describe("publish honesty", () => {
  it("does not treat HTTP 201 as published", () => {
    expect(httpCreatedIsNotPublished()).toBe(false);
  });

  it("keeps LinkedIn capabilities disabled until an adapter exists", () => {
    expect(linkedinCapabilityManifest).toEqual({
      network: "linkedin",
      oauth: false,
      publish: false,
      comments: false,
      analytics: false,
      inbox: false,
    });
  });

  it("does not retry create after unknown_external_state", () => {
    const error = new ProviderError(
      "UNKNOWN_EXTERNAL_STATE",
      "dispatch may have reached the provider",
    );
    expect(canRetryProviderCreate(error.failureClass)).toBe(false);
    expect(canRetryProviderCreate("PERMANENT")).toBe(false);
    expect(canRetryProviderCreate("RETRYABLE")).toBe(true);
  });
});
