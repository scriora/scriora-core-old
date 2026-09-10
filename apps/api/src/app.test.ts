import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createVault } from "@scriora/crypto";
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
    expect(callback.statusCode).toBe(200);
    expect(callback.json()).toMatchObject({
      platform: "linkedin",
      displayName: "Ada",
      capabilities: { oauth: true, publish: true, analytics: false },
    });
    expect(callback.json()).not.toHaveProperty("accessToken");
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

  it("publishes LinkedIn text once and does not call 201 verified", async () => {
    const vault = createVault(new Map([[1, randomBytes(32)]]), 1);
    let creates = 0;
    const app = await buildApi({
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
    const payload = {
      workspaceId: "11111111-1111-4111-8111-111111111111",
      idempotencyKey: "pub-1",
      text: "Hello professionals",
    };
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
    await app.close();
  });
});
