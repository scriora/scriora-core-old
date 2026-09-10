import {
  collectDescriptiveTelemetry,
  type TelemetryStore,
} from "@scriora/analytics";
import { isTelemetryPollSlot, type TelemetryPollSlot } from "@scriora/domain";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ApiDeps } from "../deps.js";

const pollBody = z.object({
  workspaceId: z.string().uuid(),
  idempotencyKey: z.string().min(1).max(200),
  pollSlot: z.string().min(1).max(40).default("manual"),
});

const getQuery = z.object({
  workspaceId: z.string().uuid(),
  idempotencyKey: z.string().min(1).max(200),
});

export function registerTelemetryRoutes(app: FastifyInstance, deps: ApiDeps) {
  app.post("/publications/telemetry/poll", async (request, reply) => {
    if (!deps.telemetry) {
      return reply.code(503).send({ error: "telemetry_unconfigured" });
    }
    const body = pollBody.parse(request.body);
    if (!isTelemetryPollSlot(body.pollSlot)) {
      return reply.code(400).send({ error: "unknown_poll_slot" });
    }
    const stored = await recordPoll(deps.telemetry, {
      workspaceId: body.workspaceId,
      idempotencyKey: body.idempotencyKey,
      pollSlot: body.pollSlot,
    });
    if (!stored.ok) {
      const status =
        stored.error === "not_found"
          ? 404
          : stored.error === "not_published"
            ? 409
            : 400;
      return reply.code(status).send({ error: stored.error });
    }
    return stored.snapshot;
  });

  app.get("/publications/telemetry", async (request, reply) => {
    if (!deps.telemetry) {
      return reply.code(503).send({ error: "telemetry_unconfigured" });
    }
    const query = getQuery.parse(request.query);
    const context = await deps.telemetry.store.loadContext(
      query.workspaceId,
      query.idempotencyKey,
    );
    if (!context?.externalPostId) {
      return reply.code(404).send({ error: "not_found" });
    }
    return deps.telemetry.store.listForPost(
      query.workspaceId,
      context.externalPostId,
    );
  });
}

async function recordPoll(
  telemetry: NonNullable<ApiDeps["telemetry"]>,
  input: {
    workspaceId: string;
    idempotencyKey: string;
    pollSlot: TelemetryPollSlot;
  },
) {
  const store: TelemetryStore = telemetry.store;
  const context = await store.loadContext(
    input.workspaceId,
    input.idempotencyKey,
  );
  if (!context) {
    return { ok: false as const, error: "not_found" };
  }
  if (!context.externalPostId) {
    return { ok: false as const, error: "not_published" };
  }
  const existing = await store.getBySlot(
    input.workspaceId,
    context.externalPostId,
    input.pollSlot,
  );
  if (existing) {
    return { ok: true as const, snapshot: existing };
  }
  const postUrn = context.externalPostId;
  const fetchStats = telemetry.fetchStats;
  const snapshot = await collectDescriptiveTelemetry(
    context.capAnalytics && fetchStats
      ? {
          canAnalytics: true,
          fetchStats: () => fetchStats({ postUrn }),
        }
      : { canAnalytics: context.capAnalytics },
  );
  return {
    ok: true as const,
    snapshot: await store.saveSnapshot({
      workspaceId: input.workspaceId,
      socialAccountId: context.socialAccountId,
      externalPostId: postUrn,
      pollSlot: input.pollSlot,
      grantedScopes: context.grantedScopes,
      snapshot,
    }),
  };
}
