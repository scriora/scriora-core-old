import { Readable } from "node:stream";
import { insertMediaAsset } from "@scriora/db";
import {
  createMediaUploadGrant,
  maxBytesForMime,
  storeMediaStream,
  verifyMediaUploadGrant,
} from "@scriora/media";
import {
  finishLinkedInConnect,
  type LinkedInOAuthPorts,
  type LinkedInPublishPorts,
  publishLinkedInText,
  startLinkedInConnect,
} from "@scriora/social";
import Fastify from "fastify";
import type { Pool } from "pg";
import { z } from "zod";

const healthSchema = z.object({
  ok: z.literal(true),
  service: z.literal("scriora-api"),
  modes: z.tuple([
    z.literal("CLASSIC"),
    z.literal("AGENT"),
    z.literal("MISSION"),
  ]),
});

const connectBody = z.object({
  workspaceId: z.string().uuid(),
});

const callbackQuery = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

const mediaCreateBody = z.object({
  workspaceId: z.string().uuid(),
  mime: z.string().min(1),
});

const publishBody = z.object({
  workspaceId: z.string().uuid(),
  idempotencyKey: z.string().min(1).max(200),
  text: z.string().min(1).max(3000),
});

const mediaPutQuery = z.object({
  workspaceId: z.string().uuid(),
  uploadId: z.string().min(1),
  mime: z.string().min(1),
  maxBytes: z.coerce.number().int().positive(),
  expiresAt: z.coerce.number().int().positive(),
  signature: z.string().min(1),
});

export type ApiDeps = {
  linkedin?: LinkedInOAuthPorts;
  linkedinPublish?: LinkedInPublishPorts;
  media?: {
    hmacSecret: string;
    rootDir: string;
    pool?: Pool;
  };
};

export async function buildApi(deps: ApiDeps = {}) {
  const app = Fastify({ logger: false, bodyLimit: 21 * 1024 * 1024 });

  for (const mime of [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "application/pdf",
    "application/octet-stream",
  ]) {
    app.addContentTypeParser(mime, (_request, payload, done) => {
      done(null, payload);
    });
  }

  app.get("/health", async () => {
    return healthSchema.parse({
      ok: true,
      service: "scriora-api",
      modes: ["CLASSIC", "AGENT", "MISSION"],
    });
  });

  app.post("/integrations/linkedin/connect", async (request, reply) => {
    if (!deps.linkedin) {
      return reply.code(503).send({ error: "linkedin_oauth_unconfigured" });
    }
    const body = connectBody.parse(request.body);
    const started = await startLinkedInConnect(deps.linkedin, body.workspaceId);
    return started;
  });

  app.get("/integrations/linkedin/callback", async (request, reply) => {
    if (!deps.linkedin) {
      return reply.code(503).send({ error: "linkedin_oauth_unconfigured" });
    }
    const query = callbackQuery.parse(request.query);
    const result = await finishLinkedInConnect(deps.linkedin, query);
    if (!result.ok) {
      return reply.code(400).send({ error: result.error });
    }
    return result.account;
  });

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

  app.post("/publications", async (request, reply) => {
    if (!deps.linkedinPublish) {
      return reply.code(503).send({ error: "linkedin_publish_unconfigured" });
    }
    const body = publishBody.parse(request.body);
    const result = await publishLinkedInText(deps.linkedinPublish, body);
    if (!result.ok) {
      const status =
        result.error === "conflict"
          ? 409
          : result.error === "publish_denied"
            ? 403
            : 404;
      return reply.code(status).send({ error: result.error });
    }
    return result.attempt;
  });

  return app;
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
