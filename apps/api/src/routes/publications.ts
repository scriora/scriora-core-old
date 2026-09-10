import { dispatchLinkedInText } from "@scriora/social";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ApiDeps } from "../deps.js";

const publishBody = z.object({
  workspaceId: z.string().uuid(),
  contentId: z.string().uuid(),
  idempotencyKey: z.string().min(1).max(200),
});

export function registerPublicationRoutes(app: FastifyInstance, deps: ApiDeps) {
  app.post("/publications", async (request, reply) => {
    if (!deps.linkedinPublish) {
      return reply.code(503).send({ error: "linkedin_publish_unconfigured" });
    }
    if (!deps.governance) {
      return reply.code(503).send({ error: "governance_unconfigured" });
    }
    const body = publishBody.parse(request.body);
    const prepared = await deps.governance.store.loadForPublish(
      body.workspaceId,
      body.contentId,
    );
    if (!prepared) {
      return reply.code(404).send({ error: "not_found" });
    }
    if (!prepared.gate.ok) {
      return reply.code(403).send({ error: prepared.gate.error });
    }
    const result = await dispatchLinkedInText(deps.linkedinPublish, {
      workspaceId: body.workspaceId,
      idempotencyKey: body.idempotencyKey,
      text: prepared.body,
    });
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
}
