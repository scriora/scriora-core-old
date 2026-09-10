import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("compose worker", () => {
  it("runs a publish worker that is not Redis-backed publication authority", () => {
    const compose = readFileSync(
      path.join(
        fileURLToPath(new URL(".", import.meta.url)),
        "../../../compose.yaml",
      ),
      "utf8",
    );
    expect(compose).toContain("worker:");
    expect(compose).toContain("@scriora/worker");
    expect(compose).toContain("Redis is not publication authority");
  });
});
