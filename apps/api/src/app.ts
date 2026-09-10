import {
  finishLinkedInConnect,
  type LinkedInOAuthPorts,
  startLinkedInConnect,
} from "@scriora/social";
import Fastify from "fastify";
import { z } from "zod";

const healthSchema = z.object({
  ok: z.literal(true),
  service: z.literal("scriora-api"),
  modes: z.tuple([
    z.literal("CLASSIC"),
    z.literal("AGENT"),
    z.literal("MISSION"),
  ]),
});

const connectBody = z.object({
  workspaceId: z.string().uuid(),
});

const callbackQuery = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

export type ApiDeps = {
  linkedin?: LinkedInOAuthPorts;
};

export async function buildApi(deps: ApiDeps = {}) {
  const app = Fastify({ logger: false });

  app.get("/health", async () => {
    return healthSchema.parse({
      ok: true,
      service: "scriora-api",
      modes: ["CLASSIC", "AGENT", "MISSION"],
    });
  });

  app.post("/integrations/linkedin/connect", async (request, reply) => {
    if (!deps.linkedin) {
      return reply.code(503).send({ error: "linkedin_oauth_unconfigured" });
    }
    const body = connectBody.parse(request.body);
    const started = await startLinkedInConnect(deps.linkedin, body.workspaceId);
    return started;
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

  return app;
}
