import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rename, unlink } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { randomToken } from "@scriora/crypto";
import { sniffMediaMime } from "./sniff.js";

export async function storeMediaStream(input: {
  stream: Readable;
  declaredMime: string;
  maxBytes: number;
  workspaceId: string;
  rootDir: string;
}): Promise<{
  sha256: string;
  bytes: number;
  mime: string;
  storageKey: string;
}> {
  await mkdir(input.rootDir, { recursive: true });
  const tempPath = path.join(input.rootDir, `tmp-${randomToken()}`);
  const hash = createHash("sha256");
  const out = createWriteStream(tempPath);
  let bytes = 0;
  let header = Buffer.alloc(0);
  let sniffed: string | null = null;

  try {
    for await (const chunk of input.stream) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buf.byteLength;
      if (bytes > input.maxBytes) {
        throw new Error("media too large");
      }
      if (header.length < 16) {
        header = Buffer.concat([header, buf.subarray(0, 16 - header.length)]);
        if (header.length >= 12 || buf.byteLength === 0) {
          sniffed = sniffMediaMime(header);
        }
      }
      hash.update(buf);
      if (!out.write(buf)) {
        await onceDrain(out);
      }
    }
    if (!sniffed) {
      sniffed = sniffMediaMime(header);
    }
    if (sniffed !== input.declaredMime) {
      throw new Error("media type mismatch");
    }
    await closeWriter(out);
    const sha256 = hash.digest("hex");
    const storageKey = `${input.workspaceId}/${sha256}`;
    const finalPath = path.join(input.rootDir, input.workspaceId, sha256);
    await mkdir(path.dirname(finalPath), { recursive: true });
    await rename(tempPath, finalPath);
    return { sha256, bytes, mime: sniffed, storageKey };
  } catch (error) {
    out.destroy();
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

function onceDrain(out: ReturnType<typeof createWriteStream>): Promise<void> {
  return new Promise((resolve, reject) => {
    out.once("drain", resolve);
    out.once("error", reject);
  });
}

function closeWriter(out: ReturnType<typeof createWriteStream>): Promise<void> {
  return new Promise((resolve, reject) => {
    out.end((error: Error | null | undefined) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
