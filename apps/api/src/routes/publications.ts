import { dispatchLinkedInText } from "@scriora/social";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ApiDeps } from "../deps.js";

const publishBody = z.object({
  workspaceId: z.string().uuid(),
  idempotencyKey: z.string().min(1).max(200),
  text: z.string().min(1).max(3000),
});

export function registerPublicationRoutes(app: FastifyInstance, deps: ApiDeps) {
  app.post("/publications", async (request, reply) => {
    if (!deps.linkedinPublish) {
      return reply.code(503).send({ error: "linkedin_publish_unconfigured" });
    }
    const body = publishBody.parse(request.body);
    const result = await dispatchLinkedInText(deps.linkedinPublish, body);
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
