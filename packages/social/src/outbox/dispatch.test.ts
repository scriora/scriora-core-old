import { randomBytes } from "node:crypto";
import { createVault } from "@scriora/crypto";
import { describe, expect, it } from "vitest";
import {
  createMemoryLinkedInPublishStore,
  type LinkedInPublishPorts,
} from "../linkedin/publish.js";
import {
  createMemoryOutboxStore,
  dispatchLinkedInText,
  enqueueLinkedInText,
  processDueOutbox,
} from "./dispatch.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";

function testPorts(creates: { count: number }) {
  const vault = createVault(new Map([[1, randomBytes(32)]]), 1);
  const ports: LinkedInPublishPorts & {
    outbox: ReturnType<typeof createMemoryOutboxStore>;
  } = {
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
  return ports;
}

describe("publish outbox", () => {
  it("dispatches a reserved command once through the worker", async () => {
    const creates = { count: 0 };
    const ports = testPorts(creates);
    const input = {
      workspaceId,
      idempotencyKey: "pub-1",
      text: "Hello professionals",
    };
    const first = await dispatchLinkedInText(ports, input);
    const second = await dispatchLinkedInText(ports, input);
    expect(creates.count).toBe(1);
    expect(first).toMatchObject({
      ok: true,
      attempt: { status: "PLATFORM_PENDING" },
    });
    expect(second).toMatchObject({
      ok: true,
      attempt: { status: "PLATFORM_PENDING" },
    });
  });

  it("moves unknown outcomes to the dead-letter outbox without a second create", async () => {
    const creates = { count: 0 };
    const ports = testPorts(creates);
    ports.createShare = async () => {
      creates.count += 1;
      return { httpStatus: 201, restliId: null };
    };
    const input = {
      workspaceId,
      idempotencyKey: "pub-1",
      text: "Hello professionals",
    };
    await dispatchLinkedInText(ports, input);
    await processDueOutbox(ports);
    expect(creates.count).toBe(1);
  });

  it("does not dispatch a future scheduled command until it is due", async () => {
    const creates = { count: 0 };
    const ports = testPorts(creates);
    await enqueueLinkedInText(ports, {
      workspaceId,
      idempotencyKey: "later",
      text: "Later",
      nextAttemptAt: new Date("2099-01-01T00:00:00.000Z"),
    });
    expect(await processDueOutbox(ports)).toBe(0);
    expect(creates.count).toBe(0);
    const queued = await ports.outbox.listByState(workspaceId, "PENDING");
    expect(queued).toHaveLength(1);
  });
});
