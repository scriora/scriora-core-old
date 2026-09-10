import { describe, expect, it } from "vitest";
import { canTransition } from "./index.js";

describe("content transitions", () => {
  it("allows review to approval", () => {
    expect(canTransition("IN_REVIEW", "APPROVED")).toBe(true);
  });

  it("forbids skipping the human gate", () => {
    expect(canTransition("DRAFT", "PUBLISHED")).toBe(false);
    expect(canTransition("IDEA", "SCHEDULED")).toBe(false);
  });

  it("does not treat failed as published", () => {
    expect(canTransition("FAILED", "PUBLISHED")).toBe(false);
  });
});
