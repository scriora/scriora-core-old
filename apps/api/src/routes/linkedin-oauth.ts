import { finishLinkedInConnect, startLinkedInConnect } from "@scriora/social";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ApiDeps } from "../deps.js";

const connectBody = z.object({
  workspaceId: z.string().uuid(),
});

const callbackQuery = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

export function registerLinkedInOAuthRoutes(
  app: FastifyInstance,
  deps: ApiDeps,
) {
  app.post("/integrations/linkedin/connect", async (request, reply) => {
    if (!deps.linkedin) {
      return reply.code(503).send({ error: "linkedin_oauth_unconfigured" });
    }
    const body = connectBody.parse(request.body);
    return startLinkedInConnect(deps.linkedin, body.workspaceId);
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
}
