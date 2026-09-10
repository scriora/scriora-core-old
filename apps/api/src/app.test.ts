import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createMemoryTelemetryStore } from "@scriora/analytics";
import { createVault } from "@scriora/crypto";
import { createMemoryWorkspaceStore } from "@scriora/db";
import { createMemoryGovernanceStore } from "@scriora/policies";
import {
  createMemoryLinkedInOAuthStore,
  createMemoryLinkedInPublishStore,
  createMemoryOutboxStore,
} from "@scriora/social";
import { describe, expect, it } from "vitest";
import { buildApi } from "./app.js";

describe("api", () => {
  it("serves health without claiming publish", async () => {
    const app = await buildApi();
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      service: "scriora-api",
    });
    await app.close();
  });

  it("connects LinkedIn through callback without exposing tokens", async () => {
    const app = await buildApi({
      linkedin: {
        now: () => new Date("2026-09-10T09:00:00.000Z"),
        vault: createVault(new Map([[1, randomBytes(32)]]), 1),
        store: createMemoryLinkedInOAuthStore(),
        clientId: "client-id",
        redirectUri: "https://app.scriora.test/integrations/linkedin/callback",
        requestedScopes: "openid profile w_member_social",
        async exchangeAuthorizationCode() {
          return {
            accessToken: "access",
            refreshToken: null,
            expiresAt: null,
            scopes: ["openid", "w_member_social"],
          };
        },
        async fetchMember() {
          return { id: "urn:li:person:abc", name: "Ada" };
        },
      },
    });

    const connect = await app.inject({
      method: "POST",
      url: "/integrations/linkedin/connect",
      payload: { workspaceId: "11111111-1111-4111-8111-111111111111" },
    });
    expect(connect.statusCode).toBe(200);
    const authorizationUrl = (connect.json() as { authorizationUrl: string })
      .authorizationUrl;
    const state = new URL(authorizationUrl).searchParams.get("state") ?? "";

    const callback = await app.inject({
      method: "GET",
      url: `/integrations/linkedin/callback?code=code&state=${encodeURIComponent(state)}`,
    });
    expect(callback.statusCode).toBe(302);
    expect(callback.headers.location).toBe(
      "http://127.0.0.1:3000/classic/status?linkedin=connected",
    );
    expect(JSON.stringify(callback.headers)).not.toContain("access");
    await app.close();
  });

  it("issues a signed upload grant and stores a streamed png", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "scriora-api-media-"));
    const png = Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082",
      "hex",
    );
    try {
      const app = await buildApi({
        media: { hmacSecret: "test-hmac", rootDir: dir },
      });
      const grant = await app.inject({
        method: "POST",
        url: "/media/uploads",
        payload: {
          workspaceId: "11111111-1111-4111-8111-111111111111",
          mime: "image/png",
        },
      });
      expect(grant.statusCode).toBe(200);
      const url = (grant.json() as { url: string }).url;
      const put = await app.inject({
        method: "PUT",
        url,
        headers: { "content-type": "image/png" },
        payload: png,
      });
      expect(put.statusCode).toBe(200);
      expect(put.json()).toMatchObject({
        mime: "image/png",
        bytes: png.byteLength,
        linkedinAssetUrn: null,
      });
      const rejected = await app.inject({
        method: "PUT",
        url,
        headers: { "content-type": "image/png" },
        payload: Buffer.from("<html>"),
      });
      expect(rejected.statusCode).toBe(400);
      await app.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("refuses live publish without approval", async () => {
    const vault = createVault(new Map([[1, randomBytes(32)]]), 1);
    let creates = 0;
    const app = await buildApi({
      governance: { store: createMemoryGovernanceStore() },
      linkedinPublish: {
        now: () => new Date("2026-09-10T12:00:00.000Z"),
        vault,
        store: createMemoryLinkedInPublishStore([
          {
            workspaceId: "11111111-1111-4111-8111-111111111111",
            memberId: "urn:li:person:abc",
            canPublish: true,
            tokenEnvelope: vault.encrypt(
              new TextEncoder().encode(
                JSON.stringify({ accessToken: "access" }),
              ),
            ),
          },
        ]),
        outbox: createMemoryOutboxStore(),
        async createShare() {
          creates += 1;
          return { httpStatus: 201, restliId: "urn:li:share:1" };
        },
        async verifyShare() {
          return 403;
        },
      },
    });
    const workspaceId = "11111111-1111-4111-8111-111111111111";
    const draft = await app.inject({
      method: "POST",
      url: "/contents",
      payload: { workspaceId, body: "Hello professionals" },
    });
    const contentId = (draft.json() as { id: string }).id;
    const denied = await app.inject({
      method: "POST",
      url: "/publications",
      payload: { workspaceId, contentId, idempotencyKey: "pub-1" },
    });
    expect(draft.statusCode).toBe(200);
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toEqual({ error: "unapproved" });
    expect(creates).toBe(0);
    await app.close();
  });

  it("publishes LinkedIn text once after approval and does not call 201 verified", async () => {
    const vault = createVault(new Map([[1, randomBytes(32)]]), 1);
    let creates = 0;
    const app = await buildApi({
      governance: { store: createMemoryGovernanceStore() },
      linkedinPublish: {
        now: () => new Date("2026-09-10T12:00:00.000Z"),
        vault,
        store: createMemoryLinkedInPublishStore([
          {
            workspaceId: "11111111-1111-4111-8111-111111111111",
            memberId: "urn:li:person:abc",
            canPublish: true,
            tokenEnvelope: vault.encrypt(
              new TextEncoder().encode(
                JSON.stringify({ accessToken: "access" }),
              ),
            ),
          },
        ]),
        outbox: createMemoryOutboxStore(),
        async createShare() {
          creates += 1;
          return { httpStatus: 201, restliId: "urn:li:share:1" };
        },
        async verifyShare() {
          return 403;
        },
      },
    });
    const workspaceId = "11111111-1111-4111-8111-111111111111";
    const draft = await app.inject({
      method: "POST",
      url: "/contents",
      payload: { workspaceId, body: "Hello professionals" },
    });
    const contentId = (draft.json() as { id: string }).id;
    const submitted = await app.inject({
      method: "POST",
      url: `/contents/${contentId}/submit`,
      payload: { workspaceId },
    });
    const approvalId = (submitted.json() as { approval: { id: string } })
      .approval.id;
    await app.inject({
      method: "POST",
      url: `/approvals/${approvalId}/decide`,
      payload: { workspaceId, decision: "APPROVED" },
    });
    const payload = { workspaceId, contentId, idempotencyKey: "pub-1" };
    const first = await app.inject({
      method: "POST",
      url: "/publications",
      payload,
    });
    const second = await app.inject({
      method: "POST",
      url: "/publications",
      payload,
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      status: "PLATFORM_PENDING",
      externalPostId: "urn:li:share:1",
    });
    expect(second.json()).toMatchObject({ status: "PLATFORM_PENDING" });
    expect(creates).toBe(1);
    await app.inject({
      method: "PUT",
      url: "/autonomy",
      payload: { workspaceId, dispatchPaused: true },
    });
    const paused = await app.inject({
      method: "POST",
      url: "/publications",
      payload: { workspaceId, contentId, idempotencyKey: "pub-paused" },
    });
    expect(paused.statusCode).toBe(403);
    expect(paused.json()).toEqual({ error: "killswitch" });
    expect(creates).toBe(1);
    await app.close();
  });

  it("schedules approved content without dispatching early", async () => {
    const vault = createVault(new Map([[1, randomBytes(32)]]), 1);
    let creates = 0;
    const app = await buildApi({
      governance: { store: createMemoryGovernanceStore() },
      linkedinPublish: {
        now: () => new Date("2026-09-10T12:00:00.000Z"),
        vault,
        store: createMemoryLinkedInPublishStore([
          {
            workspaceId: "11111111-1111-4111-8111-111111111111",
            memberId: "urn:li:person:abc",
            canPublish: true,
            tokenEnvelope: vault.encrypt(
              new TextEncoder().encode(
                JSON.stringify({ accessToken: "access" }),
              ),
            ),
          },
        ]),
        outbox: createMemoryOutboxStore(),
        async createShare() {
          creates += 1;
          return { httpStatus: 201, restliId: "urn:li:share:1" };
        },
        async verifyShare() {
          return 403;
        },
      },
    });
    const workspaceId = "11111111-1111-4111-8111-111111111111";
    const draft = await app.inject({
      method: "POST",
      url: "/contents",
      payload: { workspaceId, body: "Scheduled professionals" },
    });
    const contentId = (draft.json() as { id: string }).id;
    const blocked = await app.inject({
      method: "POST",
      url: `/contents/${contentId}/schedule`,
      payload: {
        workspaceId,
        idempotencyKey: "sched-1",
        scheduledAt: "2099-01-01T00:00:00.000Z",
      },
    });
    expect(blocked.statusCode).toBe(403);
    const submitted = await app.inject({
      method: "POST",
      url: `/contents/${contentId}/submit`,
      payload: { workspaceId },
    });
    await app.inject({
      method: "POST",
      url: `/approvals/${(submitted.json() as { approval: { id: string } }).approval.id}/decide`,
      payload: { workspaceId, decision: "APPROVED" },
    });
    const scheduled = await app.inject({
      method: "POST",
      url: `/contents/${contentId}/schedule`,
      payload: {
        workspaceId,
        idempotencyKey: "sched-1",
        scheduledAt: "2099-01-01T00:00:00.000Z",
      },
    });
    const queue = await app.inject({
      method: "GET",
      url: `/queue?workspaceId=${workspaceId}`,
    });
    const inbox = await app.inject({
      method: "GET",
      url: `/inbox?workspaceId=${workspaceId}`,
    });
    expect(scheduled.statusCode).toBe(200);
    expect(scheduled.json()).toMatchObject({
      status: "SCHEDULED",
      originMode: "CLASSIC",
      source: "human",
    });
    expect((queue.json() as { pending: unknown[] }).pending).toHaveLength(1);
    expect((inbox.json() as { approvals: unknown[] }).approvals).toHaveLength(
      0,
    );
    expect(creates).toBe(0);
    await app.close();
  });

  it("records permission-limited telemetry without inventing lift", async () => {
    let fetched = 0;
    const app = await buildApi({
      telemetry: {
        store: createMemoryTelemetryStore([
          {
            workspaceId: "11111111-1111-4111-8111-111111111111",
            idempotencyKey: "pub-1",
            context: {
              socialAccountId: "22222222-2222-4222-8222-222222222222",
              externalPostId: "urn:li:share:1",
              capAnalytics: false,
              grantedScopes: ["w_member_social"],
            },
          },
        ]),
        async fetchStats() {
          fetched += 1;
          return { httpStatus: 200, body: { impressions: 99 } };
        },
      },
    });
    const payload = {
      workspaceId: "11111111-1111-4111-8111-111111111111",
      idempotencyKey: "pub-1",
    };
    const first = await app.inject({
      method: "POST",
      url: "/publications/telemetry/poll",
      payload,
    });
    const second = await app.inject({
      method: "POST",
      url: "/publications/telemetry/poll",
      payload,
    });
    const listed = await app.inject({
      method: "GET",
      url: "/publications/telemetry?workspaceId=11111111-1111-4111-8111-111111111111&idempotencyKey=pub-1",
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      dataCapability: "PERMISSION_LIMITED",
      pollSlot: "manual",
    });
    expect(
      (
        first.json() as { metrics: Array<{ value: number | null }> }
      ).metrics.every((row) => row.value === null),
    ).toBe(true);
    expect((second.json() as { id: string }).id).toBe(
      (first.json() as { id: string }).id,
    );
    expect(listed.json()).toHaveLength(1);
    expect(fetched).toBe(0);
    await app.close();
  });

  it("creates named workspaces and rejects empty or duplicate names", async () => {
    const app = await buildApi({
      workspaces: createMemoryWorkspaceStore(),
    });
    const empty = await app.inject({
      method: "POST",
      url: "/workspaces",
      payload: { name: " " },
    });
    const ada = await app.inject({
      method: "POST",
      url: "/session",
      payload: { email: "ada@scriora.test", name: "Ada" },
    });
    const bob = await app.inject({
      method: "POST",
      url: "/session",
      payload: { email: "bob@scriora.test", name: "Bob" },
    });
    const adaId = (ada.json() as { userId: string }).userId;
    const bobId = (bob.json() as { userId: string }).userId;
    const created = await app.inject({
      method: "POST",
      url: "/workspaces",
      payload: { name: "Studio", userId: adaId },
    });
    const duplicate = await app.inject({
      method: "POST",
      url: "/workspaces",
      payload: { name: "studio", userId: adaId },
    });
    const listedAda = await app.inject({
      method: "GET",
      url: `/workspaces?userId=${adaId}`,
    });
    const listedBob = await app.inject({
      method: "GET",
      url: `/workspaces?userId=${bobId}`,
    });
    expect(empty.statusCode).toBe(400);
    expect(ada.statusCode).toBe(200);
    expect(created.statusCode).toBe(200);
    expect(duplicate.statusCode).toBe(409);
    expect(listedAda.json()).toHaveLength(1);
    expect(listedBob.json()).toHaveLength(0);
    await app.close();
  });

  it("reports LinkedIn connection health without token secrets", async () => {
    const store = createMemoryLinkedInOAuthStore();
    const app = await buildApi({
      linkedin: {
        now: () => new Date("2026-09-10T09:00:00.000Z"),
        vault: createVault(new Map([[1, randomBytes(32)]]), 1),
        store,
        clientId: "client-id",
        redirectUri: "https://app.scriora.test/integrations/linkedin/callback",
        requestedScopes: "openid profile w_member_social",
        async exchangeAuthorizationCode() {
          return {
            accessToken: "access",
            refreshToken: null,
            expiresAt: new Date("2026-09-10T08:00:00.000Z"),
            scopes: ["openid", "w_member_social"],
          };
        },
        async fetchMember() {
          return { id: "urn:li:person:abc", name: "Ada" };
        },
      },
    });
    const workspaceId = "11111111-1111-4111-8111-111111111111";
    const disconnected = await app.inject({
      method: "GET",
      url: `/integrations/linkedin?workspaceId=${workspaceId}`,
    });
    const connect = await app.inject({
      method: "POST",
      url: "/integrations/linkedin/connect",
      payload: { workspaceId },
    });
    const state =
      new URL(
        (connect.json() as { authorizationUrl: string }).authorizationUrl,
      ).searchParams.get("state") ?? "";
    await app.inject({
      method: "GET",
      url: `/integrations/linkedin/callback?code=code&state=${encodeURIComponent(state)}`,
    });
    const connected = await app.inject({
      method: "GET",
      url: `/integrations/linkedin?workspaceId=${workspaceId}`,
    });
    expect(disconnected.json()).toMatchObject({
      connected: false,
      needsReauth: true,
    });
    expect(connected.json()).toMatchObject({
      connected: true,
      memberUrn: "urn:li:person:abc",
      displayName: "Ada",
      needsReauth: true,
    });
    expect(connected.json()).not.toHaveProperty("accessToken");
    await app.close();
  });

  it("attaches media ids to drafts used for publish", async () => {
    const vault = createVault(new Map([[1, randomBytes(32)]]), 1);
    const store = createMemoryGovernanceStore();
    const mediaId = "33333333-3333-4333-8333-333333333333";
    const app = await buildApi({
      governance: { store },
      linkedinPublish: {
        now: () => new Date("2026-09-10T12:00:00.000Z"),
        vault,
        store: createMemoryLinkedInPublishStore([
          {
            workspaceId: "11111111-1111-4111-8111-111111111111",
            memberId: "urn:li:person:abc",
            canPublish: true,
            tokenEnvelope: vault.encrypt(
              new TextEncoder().encode(
                JSON.stringify({ accessToken: "access" }),
              ),
            ),
          },
        ]),
        outbox: createMemoryOutboxStore(),
        async createShare() {
          return { httpStatus: 201, restliId: "urn:li:share:1" };
        },
        async verifyShare() {
          return 403;
        },
      },
    });
    const workspaceId = "11111111-1111-4111-8111-111111111111";
    const draft = await app.inject({
      method: "POST",
      url: "/contents",
      payload: { workspaceId, body: "With image", mediaAssetIds: [mediaId] },
    });
    const contentId = (draft.json() as { id: string }).id;
    expect(draft.json()).toMatchObject({ mediaAssetIds: [mediaId] });
    const submitted = await app.inject({
      method: "POST",
      url: `/contents/${contentId}/submit`,
      payload: { workspaceId },
    });
    await app.inject({
      method: "POST",
      url: `/approvals/${(submitted.json() as { approval: { id: string } }).approval.id}/decide`,
      payload: { workspaceId, decision: "APPROVED", actor: "Ada" },
    });
    const prepared = await store.loadForPublish(workspaceId, contentId);
    expect(prepared?.mediaAssetIds).toEqual([mediaId]);
    await app.close();
  });

  it("reschedules a pending post and records the approval actor", async () => {
    const vault = createVault(new Map([[1, randomBytes(32)]]), 1);
    const app = await buildApi({
      governance: { store: createMemoryGovernanceStore() },
      linkedinPublish: {
        now: () => new Date("2026-09-10T12:00:00.000Z"),
        vault,
        store: createMemoryLinkedInPublishStore([
          {
            workspaceId: "11111111-1111-4111-8111-111111111111",
            memberId: "urn:li:person:abc",
            canPublish: true,
            tokenEnvelope: vault.encrypt(
              new TextEncoder().encode(
                JSON.stringify({ accessToken: "access" }),
              ),
            ),
          },
        ]),
        outbox: createMemoryOutboxStore(),
        async createShare() {
          return { httpStatus: 201, restliId: "urn:li:share:1" };
        },
        async verifyShare() {
          return 403;
        },
      },
    });
    const workspaceId = "11111111-1111-4111-8111-111111111111";
    const draft = await app.inject({
      method: "POST",
      url: "/contents",
      payload: { workspaceId, body: "Move me" },
    });
    const contentId = (draft.json() as { id: string }).id;
    const submitted = await app.inject({
      method: "POST",
      url: `/contents/${contentId}/submit`,
      payload: { workspaceId },
    });
    const decided = await app.inject({
      method: "POST",
      url: `/approvals/${(submitted.json() as { approval: { id: string } }).approval.id}/decide`,
      payload: { workspaceId, decision: "APPROVED", actor: "Ada" },
    });
    expect(decided.json()).toMatchObject({
      approval: { decidedBy: "Ada" },
    });
    await app.inject({
      method: "POST",
      url: `/contents/${contentId}/schedule`,
      payload: {
        workspaceId,
        idempotencyKey: `schedule:${contentId}`,
        scheduledAt: "2099-01-01T00:00:00.000Z",
      },
    });
    const moved = await app.inject({
      method: "PATCH",
      url: `/contents/${contentId}/schedule`,
      payload: {
        workspaceId,
        idempotencyKey: `schedule:${contentId}`,
        scheduledAt: "2099-06-01T00:00:00.000Z",
      },
    });
    const inbox = await app.inject({
      method: "GET",
      url: `/inbox?workspaceId=${workspaceId}`,
    });
    expect(moved.statusCode).toBe(200);
    expect(moved.json()).toMatchObject({
      scheduledAt: "2099-06-01T00:00:00.000Z",
    });
    expect(
      (inbox.json() as { history: Array<{ decidedBy: string }> }).history[0]
        ?.decidedBy,
    ).toBe("Ada");
    await app.close();
  });

  it("rejects two posts scheduled in the same minute", async () => {
    const vault = createVault(new Map([[1, randomBytes(32)]]), 1);
    const app = await buildApi({
      governance: { store: createMemoryGovernanceStore() },
      linkedinPublish: {
        now: () => new Date("2026-09-10T12:00:00.000Z"),
        vault,
        store: createMemoryLinkedInPublishStore([
          {
            workspaceId: "11111111-1111-4111-8111-111111111111",
            memberId: "urn:li:person:abc",
            canPublish: true,
            tokenEnvelope: vault.encrypt(
              new TextEncoder().encode(
                JSON.stringify({ accessToken: "access" }),
              ),
            ),
          },
        ]),
        outbox: createMemoryOutboxStore(),
        async createShare() {
          return { httpStatus: 201, restliId: "urn:li:share:1" };
        },
        async verifyShare() {
          return 403;
        },
      },
    });
    const workspaceId = "11111111-1111-4111-8111-111111111111";
    async function approve(body: string) {
      const draft = await app.inject({
        method: "POST",
        url: "/contents",
        payload: { workspaceId, body },
      });
      const contentId = (draft.json() as { id: string }).id;
      const submitted = await app.inject({
        method: "POST",
        url: `/contents/${contentId}/submit`,
        payload: { workspaceId },
      });
      await app.inject({
        method: "POST",
        url: `/approvals/${(submitted.json() as { approval: { id: string } }).approval.id}/decide`,
        payload: { workspaceId, decision: "APPROVED", actor: "Ada" },
      });
      return contentId;
    }
    const first = await approve("One");
    const second = await approve("Two");
    const when = "2099-01-01T00:00:00.000Z";
    const ok = await app.inject({
      method: "POST",
      url: `/contents/${first}/schedule`,
      payload: {
        workspaceId,
        idempotencyKey: `schedule:${first}`,
        scheduledAt: when,
      },
    });
    const clash = await app.inject({
      method: "POST",
      url: `/contents/${second}/schedule`,
      payload: {
        workspaceId,
        idempotencyKey: `schedule:${second}`,
        scheduledAt: when,
      },
    });
    expect(ok.statusCode).toBe(200);
    expect(clash.statusCode).toBe(409);
    expect(clash.json()).toEqual({ error: "conflict" });
    await app.close();
  });
});
