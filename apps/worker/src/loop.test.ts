import { randomBytes } from "node:crypto";
import { createVault } from "@scriora/crypto";
import {
  createMemoryLinkedInPublishStore,
  createMemoryOutboxStore,
  enqueueLinkedInText,
} from "@scriora/social";
import { describe, expect, it } from "vitest";
import { runOutboxLoop, runOutboxTick, workerPollMs } from "./boot.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";

function testPorts(creates: { count: number }) {
  const vault = createVault(new Map([[1, randomBytes(32)]]), 1);
  return {
    now: () => new Date("2026-09-10T12:00:00.000Z"),
    vault,
    store: createMemoryLinkedInPublishStore([
      {
        workspaceId,
        memberId: "urn:li:person:abc",
        canPublish: true,
        tokenEnvelope: vault.encrypt(
          new TextEncoder().encode(JSON.stringify({ accessToken: "access" })),
        ),
      },
    ]),
    outbox: createMemoryOutboxStore(),
    async createShare() {
      creates.count += 1;
      return { httpStatus: 201, restliId: "urn:li:share:1" };
    },
    async verifyShare() {
      return 403;
    },
  };
}

describe("worker outbox loop", () => {
  it("honors WORKER_POLL_MS", () => {
    expect(workerPollMs({ WORKER_POLL_MS: "1500" })).toBe(1500);
    expect(workerPollMs({ WORKER_POLL_MS: "10" })).toBe(5000);
  });

  it("processes a due outbox row on one tick", async () => {
    const creates = { count: 0 };
    const ports = testPorts(creates);
    await enqueueLinkedInText(ports, {
      workspaceId,
      idempotencyKey: "due-1",
      text: "Due now",
    });
    expect(await runOutboxTick(ports)).toBe(1);
    expect(creates.count).toBe(1);
  });

  it("skips a future scheduled command", async () => {
    const creates = { count: 0 };
    const ports = testPorts(creates);
    await enqueueLinkedInText(ports, {
      workspaceId,
      idempotencyKey: "later",
      text: "Later",
      nextAttemptAt: new Date("2099-01-01T00:00:00.000Z"),
    });
    expect(await runOutboxTick(ports)).toBe(0);
    expect(creates.count).toBe(0);
  });

  it("ticks until aborted", async () => {
    let ticks = 0;
    const signal = AbortSignal.timeout(50);
    await runOutboxLoop({
      pollMs: 5,
      signal,
      tick: async () => {
        ticks += 1;
      },
    });
    expect(ticks).toBeGreaterThan(0);
  });
});
