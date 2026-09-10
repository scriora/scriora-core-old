import { enqueueLinkedInText } from "@scriora/social";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ApiDeps } from "../deps.js";

const draftBody = z.object({
  workspaceId: z.string().uuid(),
  body: z.string().min(1).max(3000),
  mediaAssetIds: z.array(z.string().uuid()).max(4).optional(),
});

const workspaceBody = z.object({
  workspaceId: z.string().uuid(),
});

const workspaceQuery = z.object({
  workspaceId: z.string().uuid(),
});

const scheduleBody = z.object({
  workspaceId: z.string().uuid(),
  idempotencyKey: z.string().min(1).max(200),
  scheduledAt: z.string().datetime(),
});

export function registerContentRoutes(app: FastifyInstance, deps: ApiDeps) {
  app.get("/contents", async (request, reply) => {
    if (!deps.governance) {
      return reply.code(503).send({ error: "governance_unconfigured" });
    }
    const query = workspaceQuery.parse(request.query);
    return deps.governance.store.listContents(query.workspaceId);
  });

  app.post("/contents", async (request, reply) => {
    if (!deps.governance) {
      return reply.code(503).send({ error: "governance_unconfigured" });
    }
    const body = draftBody.parse(request.body);
    return deps.governance.store.createDraft({
      workspaceId: body.workspaceId,
      body: body.body,
      ...(body.mediaAssetIds ? { mediaAssetIds: body.mediaAssetIds } : {}),
    });
  });

  app.post("/contents/:id/submit", async (request, reply) => {
    if (!deps.governance) {
      return reply.code(503).send({ error: "governance_unconfigured" });
    }
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = workspaceBody.parse(request.body);
    const result = await deps.governance.store.submit(
      body.workspaceId,
      params.id,
    );
    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 409;
      return reply.code(status).send({ error: result.error });
    }
    return result;
  });

  app.post("/contents/:id/schedule", async (request, reply) => {
    if (!deps.governance) {
      return reply.code(503).send({ error: "governance_unconfigured" });
    }
    if (!deps.linkedinPublish) {
      return reply.code(503).send({ error: "linkedin_publish_unconfigured" });
    }
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = scheduleBody.parse(request.body);
    const prepared = await deps.governance.store.loadForPublish(
      body.workspaceId,
      params.id,
    );
    if (!prepared) {
      return reply.code(404).send({ error: "not_found" });
    }
    if (!prepared.gate.ok) {
      return reply.code(403).send({ error: prepared.gate.error });
    }
    const scheduledAt = new Date(body.scheduledAt);
    const marked = await deps.governance.store.markScheduled({
      workspaceId: body.workspaceId,
      contentId: params.id,
      scheduledAt,
    });
    if (!marked.ok) {
      const status = marked.error === "not_found" ? 404 : 409;
      return reply.code(status).send({ error: marked.error });
    }
    const queued = await enqueueLinkedInText(deps.linkedinPublish, {
      workspaceId: body.workspaceId,
      idempotencyKey: body.idempotencyKey,
      text: prepared.body,
      nextAttemptAt: scheduledAt,
      ...(prepared.mediaAssetIds[0]
        ? { mediaAssetId: prepared.mediaAssetIds[0] }
        : {}),
    });
    if (!queued.ok) {
      const status =
        queued.error === "conflict"
          ? 409
          : queued.error === "publish_denied"
            ? 403
            : 404;
      return reply.code(status).send({ error: queued.error });
    }
    return marked.content;
  });

  app.patch("/contents/:id/schedule", async (request, reply) => {
    if (!deps.governance) {
      return reply.code(503).send({ error: "governance_unconfigured" });
    }
    if (!deps.linkedinPublish) {
      return reply.code(503).send({ error: "linkedin_publish_unconfigured" });
    }
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = scheduleBody.parse(request.body);
    const scheduledAt = new Date(body.scheduledAt);
    const marked = await deps.governance.store.reschedule({
      workspaceId: body.workspaceId,
      contentId: params.id,
      scheduledAt,
    });
    if (!marked.ok) {
      const status =
        marked.error === "not_found"
          ? 404
          : marked.error === "not_scheduled"
            ? 409
            : 409;
      return reply.code(status).send({ error: marked.error });
    }
    const moved = await deps.linkedinPublish.outbox.reschedule({
      workspaceId: body.workspaceId,
      idempotencyKey: body.idempotencyKey,
      nextAttemptAt: scheduledAt,
    });
    if (moved === "not_pending") {
      return reply.code(409).send({ error: "already_dispatched" });
    }
    if (moved === "not_found") {
      return reply.code(404).send({ error: "not_found" });
    }
    return marked.content;
  });
}
