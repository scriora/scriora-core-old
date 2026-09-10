import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ApiDeps } from "../deps.js";

const draftBody = z.object({
  workspaceId: z.string().uuid(),
  body: z.string().min(1).max(3000),
});

const workspaceBody = z.object({
  workspaceId: z.string().uuid(),
});

export function registerContentRoutes(app: FastifyInstance, deps: ApiDeps) {
  app.post("/contents", async (request, reply) => {
    if (!deps.governance) {
      return reply.code(503).send({ error: "governance_unconfigured" });
    }
    const body = draftBody.parse(request.body);
    return deps.governance.store.createDraft(body);
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
}
