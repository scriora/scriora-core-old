import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ApiDeps } from "../deps.js";

const decideBody = z.object({
  workspaceId: z.string().uuid(),
  decision: z.enum(["APPROVED", "REJECTED"]),
  actor: z.string().min(1).max(200).optional(),
});

const autonomyBody = z.object({
  workspaceId: z.string().uuid(),
  dispatchPaused: z.boolean(),
});

const workspaceQuery = z.object({
  workspaceId: z.string().uuid(),
});

export function registerApprovalRoutes(app: FastifyInstance, deps: ApiDeps) {
  app.get("/approvals", async (request, reply) => {
    if (!deps.governance) {
      return reply.code(503).send({ error: "governance_unconfigured" });
    }
    const query = workspaceQuery.parse(request.query);
    return deps.governance.store.listPendingApprovals(query.workspaceId);
  });

  app.get("/autonomy", async (request, reply) => {
    if (!deps.governance) {
      return reply.code(503).send({ error: "governance_unconfigured" });
    }
    const query = workspaceQuery.parse(request.query);
    return deps.governance.store.getPolicy(query.workspaceId);
  });

  app.get("/inbox", async (request, reply) => {
    if (!deps.governance) {
      return reply.code(503).send({ error: "governance_unconfigured" });
    }
    const query = workspaceQuery.parse(request.query);
    const approvals = await deps.governance.store.listPendingApprovals(
      query.workspaceId,
    );
    const history = await deps.governance.store.listApprovalHistory(
      query.workspaceId,
    );
    const dead = deps.linkedinPublish
      ? await deps.linkedinPublish.outbox.listByState(
          query.workspaceId,
          "FAILED",
        )
      : [];
    return { approvals, history, deadLetters: dead };
  });
  app.post("/approvals/:id/decide", async (request, reply) => {
    if (!deps.governance) {
      return reply.code(503).send({ error: "governance_unconfigured" });
    }
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = decideBody.parse(request.body);
    const actor =
      body.actor ??
      (typeof request.headers["x-scriora-actor"] === "string"
        ? request.headers["x-scriora-actor"]
        : "operator");
    const result = await deps.governance.store.decide({
      workspaceId: body.workspaceId,
      approvalId: params.id,
      decision: body.decision,
      actor,
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
