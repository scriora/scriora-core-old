import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ApiDeps } from "../deps.js";

const decideBody = z.object({
  workspaceId: z.string().uuid(),
  decision: z.enum(["APPROVED", "REJECTED"]),
});

const autonomyBody = z.object({
  workspaceId: z.string().uuid(),
  dispatchPaused: z.boolean(),
});

export function registerApprovalRoutes(app: FastifyInstance, deps: ApiDeps) {
  app.post("/approvals/:id/decide", async (request, reply) => {
    if (!deps.governance) {
      return reply.code(503).send({ error: "governance_unconfigured" });
    }
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = decideBody.parse(request.body);
    const result = await deps.governance.store.decide({
      workspaceId: body.workspaceId,
      approvalId: params.id,
      decision: body.decision,
    });
    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 409;
      return reply.code(status).send({ error: result.error });
    }
    return result;
  });

  app.put("/autonomy", async (request, reply) => {
    if (!deps.governance) {
      return reply.code(503).send({ error: "governance_unconfigured" });
    }
    const body = autonomyBody.parse(request.body);
    return deps.governance.store.setDispatchPaused(
      body.workspaceId,
      body.dispatchPaused,
    );
  });
}
