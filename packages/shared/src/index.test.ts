import { describe, expect, it } from "vitest";
import { err, featureInventory, ok } from "./index.js";

describe("Result", () => {
  it("wraps success and failure", () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 });
    expect(err("no")).toEqual({ ok: false, error: "no" });
  });
});

describe("feature inventory", () => {
  it("does not claim unofficial APIs", () => {
    expect(featureInventory.unofficialApis).toBe("rejected");
  });

  it("does not mark Classic compose live before it exists", () => {
    expect(featureInventory.classicCompose).toBe("planned");
  });
});
