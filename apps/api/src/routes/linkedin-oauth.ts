import {
  finishLinkedInConnect,
  linkedInConnectionStatus,
  startLinkedInConnect,
} from "@scriora/social";
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
  app.get("/integrations/linkedin", async (request, reply) => {
    if (!deps.linkedin) {
      return reply.code(503).send({ error: "linkedin_oauth_unconfigured" });
    }
    const query = connectBody.parse(request.query);
    const account = await deps.linkedin.store.getConnectedAccount(
      query.workspaceId,
    );
    return linkedInConnectionStatus(account, deps.linkedin.now());
  });

  app.post("/integrations/linkedin/connect", async (request, reply) => {
    if (!deps.linkedin) {
      return reply.code(503).send({ error: "linkedin_oauth_unconfigured" });
    }
    const body = connectBody.parse(request.body);
    return startLinkedInConnect(deps.linkedin, body.workspaceId);
  });

  app.get("/integrations/linkedin/callback", async (request, reply) => {
    const origin = deps.classicAppOrigin ?? "http://127.0.0.1:3000";
    if (!deps.linkedin) {
      return reply.redirect(`${origin}/classic/status?linkedin=error`, 302);
    }
    const query = callbackQuery.parse(request.query);
    const result = await finishLinkedInConnect(deps.linkedin, query);
    if (!result.ok) {
      return reply.redirect(`${origin}/classic/status?linkedin=error`, 302);
    }
    return reply.redirect(`${origin}/classic/status?linkedin=connected`, 302);
  });
}
