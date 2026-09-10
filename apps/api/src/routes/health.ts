import type { FastifyInstance } from "fastify";
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

export function registerHealthRoutes(app: FastifyInstance) {
  app.get("/health", async () => {
    return healthSchema.parse({
      ok: true,
      service: "scriora-api",
      modes: ["CLASSIC", "AGENT", "MISSION"],
    });
  });
}
