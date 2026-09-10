import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  createMediaUploadGrant,
  sniffMediaMime,
  storeMediaStream,
  verifyMediaUploadGrant,
} from "./index.js";

const png = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082",
  "hex",
);

describe("media pipeline", () => {
  it("sniffs png and rejects html disguised as an image", () => {
    expect(sniffMediaMime(png)).toBe("image/png");
    expect(sniffMediaMime(Buffer.from("<html>"))).toBeNull();
  });

  it("stores a stream without holding the whole object as a string", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "scriora-media-"));
    try {
      const stored = await storeMediaStream({
        stream: Readable.from([png.subarray(0, 8), png.subarray(8)]),
        declaredMime: "image/png",
        maxBytes: 1024,
        workspaceId: "11111111-1111-4111-8111-111111111111",
        rootDir: dir,
      });
      expect(stored.mime).toBe("image/png");
      expect(stored.bytes).toBe(png.byteLength);
      expect(stored.sha256).toHaveLength(64);
      expect(
        stored.storageKey.startsWith("11111111-1111-4111-8111-111111111111/"),
      ).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects html bytes declared as png", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "scriora-media-"));
    try {
      await expect(
        storeMediaStream({
          stream: Readable.from([Buffer.from("<html>")]),
          declaredMime: "image/png",
          maxBytes: 1024,
          workspaceId: "11111111-1111-4111-8111-111111111111",
          rootDir: dir,
        }),
      ).rejects.toThrow("media type mismatch");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects a grant after expiry", () => {
    const grant = createMediaUploadGrant({
      secret: "secret",
      workspaceId: "11111111-1111-4111-8111-111111111111",
      mime: "image/png",
      maxBytes: 1024,
      now: new Date(0),
      ttlMs: 1,
    });
    expect(verifyMediaUploadGrant("secret", grant, new Date(2))).toBe(false);
    expect(verifyMediaUploadGrant("secret", grant, new Date(0))).toBe(true);
  });
});
