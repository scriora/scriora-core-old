import { Readable } from "node:stream";
import { insertMediaAsset } from "@scriora/db";
import {
  createMediaUploadGrant,
  maxBytesForMime,
  storeMediaStream,
  verifyMediaUploadGrant,
} from "@scriora/media";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ApiDeps } from "../deps.js";

const mediaCreateBody = z.object({
  workspaceId: z.string().uuid(),
  mime: z.string().min(1),
});

const mediaPutQuery = z.object({
  workspaceId: z.string().uuid(),
  uploadId: z.string().min(1),
  mime: z.string().min(1),
  maxBytes: z.coerce.number().int().positive(),
  expiresAt: z.coerce.number().int().positive(),
  signature: z.string().min(1),
});

export function registerMediaRoutes(app: FastifyInstance, deps: ApiDeps) {
  app.post("/media/uploads", async (request, reply) => {
    if (!deps.media) {
      return reply.code(503).send({ error: "media_unconfigured" });
    }
    const body = mediaCreateBody.parse(request.body);
    const maxBytes = maxBytesForMime(body.mime);
    if (!maxBytes) {
      return reply.code(400).send({ error: "unsupported_media_type" });
    }
    const grant = createMediaUploadGrant({
      secret: deps.media.hmacSecret,
      workspaceId: body.workspaceId,
      mime: body.mime,
      maxBytes,
      now: new Date(),
    });
    const params = new URLSearchParams({
      workspaceId: grant.workspaceId,
      uploadId: grant.uploadId,
      mime: grant.mime,
      maxBytes: String(grant.maxBytes),
      expiresAt: String(grant.expiresAt),
      signature: grant.signature,
    });
    return {
      method: "PUT",
      url: `/media/uploads/${grant.uploadId}?${params.toString()}`,
      expiresAt: new Date(grant.expiresAt).toISOString(),
      maxBytes: grant.maxBytes,
    };
  });

  app.put("/media/uploads/:uploadId", async (request, reply) => {
    if (!deps.media) {
      return reply.code(503).send({ error: "media_unconfigured" });
    }
    const query = mediaPutQuery.parse(request.query);
    if (query.uploadId !== (request.params as { uploadId: string }).uploadId) {
      return reply.code(400).send({ error: "invalid_grant" });
    }
    const ok = verifyMediaUploadGrant(deps.media.hmacSecret, query, new Date());
    if (!ok) {
      return reply.code(403).send({ error: "invalid_grant" });
    }
    let stored: {
      sha256: string;
      bytes: number;
      mime: string;
      storageKey: string;
    };
    try {
      stored = await storeMediaStream({
        stream: bodyAsReadable(request.body),
        declaredMime: query.mime,
        maxBytes: query.maxBytes,
        workspaceId: query.workspaceId,
        rootDir: deps.media.rootDir,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "media too large" || message === "media type mismatch") {
        return reply.code(400).send({ error: message.replaceAll(" ", "_") });
      }
      throw error;
    }
    if (deps.media.pool) {
      await insertMediaAsset(deps.media.pool, {
        workspaceId: query.workspaceId,
        sha256: stored.sha256,
        mime: stored.mime,
        bytes: stored.bytes,
        storageKey: stored.storageKey,
      });
    }
    return {
      sha256: stored.sha256,
      bytes: stored.bytes,
      mime: stored.mime,
      storageKey: stored.storageKey,
      linkedinAssetUrn: null,
    };
  });
}

function bodyAsReadable(body: unknown): Readable {
  if (Buffer.isBuffer(body)) {
    return Readable.from(body);
  }
  if (typeof body === "string") {
    return Readable.from(Buffer.from(body));
  }
  return body as Readable;
}
