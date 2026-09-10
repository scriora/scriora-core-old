import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ApiDeps } from "../deps.js";

const sessionBody = z.object({
  email: z.string().min(3).max(200),
  name: z.string().min(1).max(100).optional(),
});

const createBody = z.object({
  name: z.string(),
  userId: z.string().uuid().optional(),
});

const listQuery = z.object({
  userId: z.string().uuid().optional(),
});

export function registerWorkspaceRoutes(app: FastifyInstance, deps: ApiDeps) {
  app.post("/session", async (request, reply) => {
    if (!deps.workspaces) {
      return reply.code(503).send({ error: "workspaces_unconfigured" });
    }
    const body = sessionBody.parse(request.body);
    const result = await deps.workspaces.upsertOperator(body.email, body.name);
    if ("ok" in result && result.ok === false) {
      return reply.code(400).send({ error: result.error });
    }
    return result;
  });

  app.get("/workspaces", async (request, reply) => {
    if (!deps.workspaces) {
      return reply.code(503).send({ error: "workspaces_unconfigured" });
    }
    const query = listQuery.parse(request.query);
    return deps.workspaces.list(query.userId);
  });

  app.post("/workspaces", async (request, reply) => {
    if (!deps.workspaces) {
      return reply.code(503).send({ error: "workspaces_unconfigured" });
    }
    const body = createBody.parse(request.body);
    const result = await deps.workspaces.create(body.name, body.userId);
    if (!result.ok) {
      return reply
        .code(result.error === "duplicate" ? 409 : 400)
        .send({ error: result.error });
    }
    return result.workspace;
  });
}
