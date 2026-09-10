import { describe, expect, it } from "vitest";
import { httpCreatedIsNotPublished } from "./index.js";

describe("publish honesty", () => {
  it("does not treat HTTP 201 as published", () => {
    expect(httpCreatedIsNotPublished()).toBe(false);
  });
});
