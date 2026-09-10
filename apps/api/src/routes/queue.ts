import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ApiDeps } from "../deps.js";

const workspaceQuery = z.object({
  workspaceId: z.string().uuid(),
});

export function registerQueueRoutes(app: FastifyInstance, deps: ApiDeps) {
  app.get("/queue", async (request, reply) => {
    if (!deps.linkedinPublish) {
      return reply.code(503).send({ error: "linkedin_publish_unconfigured" });
    }
    const query = workspaceQuery.parse(request.query);
    const [pending, processing, published, failed] = await Promise.all([
      deps.linkedinPublish.outbox.listByState(query.workspaceId, "PENDING"),
      deps.linkedinPublish.outbox.listByState(query.workspaceId, "PROCESSING"),
      deps.linkedinPublish.outbox.listByState(query.workspaceId, "PUBLISHED"),
      deps.linkedinPublish.outbox.listByState(query.workspaceId, "FAILED"),
    ]);
    return { pending, processing, published, failed };
  });
}
