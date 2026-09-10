import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createVault } from "./index.js";

describe("AES-256-GCM vault", () => {
  it("round-trips plaintext and rejects tampering", () => {
    const key = randomBytes(32);
    const vault = createVault(new Map([[1, key]]), 1);
    const secret = new TextEncoder().encode("linkedin-refresh-token");
    const sealed = vault.encrypt(secret);

    expect(sealed.keyVersion).toBe(1);
    expect(sealed.iv.byteLength).toBe(12);
    expect(sealed.tag.byteLength).toBe(16);
    expect(new TextDecoder().decode(vault.decrypt(sealed))).toBe(
      "linkedin-refresh-token",
    );

    const tampered = {
      ...sealed,
      ciphertext: Uint8Array.from(sealed.ciphertext, (byte, i) =>
        i === 0 ? byte ^ 1 : byte,
      ),
    };
    expect(() => vault.decrypt(tampered)).toThrow();
  });

  it("decrypts prior versions after rotation", () => {
    const v1 = randomBytes(32);
    const v2 = randomBytes(32);
    const original = createVault(new Map([[1, v1]]), 1);
    const sealed = original.encrypt(new TextEncoder().encode("old"));
    const rotated = createVault(
      new Map([
        [1, v1],
        [2, v2],
      ]),
      2,
    );
    expect(new TextDecoder().decode(rotated.decrypt(sealed))).toBe("old");
    expect(rotated.encrypt(new TextEncoder().encode("new")).keyVersion).toBe(2);
  });
});
