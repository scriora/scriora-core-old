import { randomBytes } from "node:crypto";
import { createVault } from "@scriora/crypto";
import { createMemoryLinkedInOAuthStore } from "@scriora/social";
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
});
