import { describe, expect, it } from "vitest";
import { assertHonestMetric } from "./index.js";

describe("honest metrics", () => {
  it("accepts platform data", () => {
    expect(() => assertHonestMetric("platform")).not.toThrow();
  });

  it("rejects invented lift", () => {
    expect(() => assertHonestMetric("invented")).toThrow(/invented lift/);
  });
});
