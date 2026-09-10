import { randomBytes } from "node:crypto";
import { createVault } from "@scriora/crypto";
import { oauthStateTtlMs } from "@scriora/domain";
import { describe, expect, it } from "vitest";
import {
  canRetryProviderCreate,
  capabilitiesFromGrantedScopes,
  httpCreatedIsNotPublished,
  linkedinCapabilityManifest,
  ProviderError,
} from "./index.js";
import {
  createMemoryLinkedInOAuthStore,
  finishLinkedInConnect,
  type LinkedInOAuthPorts,
  startLinkedInConnect,
} from "./oauth.js";

function testPorts(
  overrides: Partial<LinkedInOAuthPorts> = {},
): LinkedInOAuthPorts {
  return {
    now: () => new Date("2026-09-10T09:00:00.000Z"),
    vault: createVault(new Map([[1, randomBytes(32)]]), 1),
    store: createMemoryLinkedInOAuthStore(),
    clientId: "client-id",
    redirectUri: "https://app.scriora.test/integrations/linkedin/callback",
    requestedScopes: "openid profile w_member_social",
    async exchangeAuthorizationCode() {
      return {
        accessToken: "access",
        refreshToken: "refresh",
        expiresAt: new Date("2026-09-10T10:00:00.000Z"),
        scopes: ["openid", "profile", "w_member_social"],
      };
    },
    async fetchMember() {
      return { id: "urn:li:person:abc", name: "Ada" };
    },
    ...overrides,
  };
}

describe("linkedin oauth", () => {
  it("does not treat HTTP 201 as published", () => {
    expect(httpCreatedIsNotPublished()).toBe(false);
  });
  it("does not retry create after unknown_external_state", () => {
    expect(
      canRetryProviderCreate(
        new ProviderError(
          "UNKNOWN_EXTERNAL_STATE",
          "dispatch may have reached the provider",
        ).failureClass,
      ),
    ).toBe(false);
  });

  it("keeps capabilities disabled until scopes are granted", () => {
    expect(linkedinCapabilityManifest.oauth).toBe(false);
    expect(linkedinCapabilityManifest.publish).toBe(false);
    expect(
      capabilitiesFromGrantedScopes(["openid", "profile", "w_member_social"]),
    ).toEqual({
      network: "linkedin",
      oauth: true,
      publish: true,
      comments: false,
      analytics: false,
      inbox: false,
    });
  });

  it("starts connect without PKCE for a confidential LinkedIn app", async () => {
    const ports = testPorts();
    const started = await startLinkedInConnect(
      ports,
      "11111111-1111-4111-8111-111111111111",
    );
    const url = new URL(started.authorizationUrl);
    expect(url.origin + url.pathname).toBe(
      "https://www.linkedin.com/oauth/v2/authorization",
    );
    expect(url.searchParams.get("code_challenge")).toBeNull();
    expect(url.searchParams.get("code_challenge_method")).toBeNull();
    const state = url.searchParams.get("state");
    expect(state).toBeTruthy();

    const finished = await finishLinkedInConnect(ports, {
      code: "code",
      state: state ?? "",
    });
    expect(finished.ok).toBe(true);
    if (!finished.ok) {
      return;
    }
    expect(finished.account.displayName).toBe("Ada");
    expect(finished.account.capabilities.publish).toBe(true);
    expect(finished.account.capabilities.analytics).toBe(false);
    expect("accessToken" in finished.account).toBe(false);
  });

  it("rejects expired and reused state", async () => {
    const ports = testPorts();
    const started = await startLinkedInConnect(
      ports,
      "11111111-1111-4111-8111-111111111111",
    );
    const state =
      new URL(started.authorizationUrl).searchParams.get("state") ?? "";
    const expired = testPorts({
      store: ports.store,
      vault: ports.vault,
      now: () =>
        new Date(Date.parse("2026-09-10T09:00:00.000Z") + oauthStateTtlMs),
    });
    expect(
      await finishLinkedInConnect(expired, { code: "code", state }),
    ).toEqual({ ok: false, error: "expired" });

    const fresh = testPorts();
    const again = await startLinkedInConnect(
      fresh,
      "11111111-1111-4111-8111-111111111111",
    );
    const reusedState =
      new URL(again.authorizationUrl).searchParams.get("state") ?? "";
    await finishLinkedInConnect(fresh, { code: "code", state: reusedState });
    expect(
      await finishLinkedInConnect(fresh, { code: "code", state: reusedState }),
    ).toEqual({ ok: false, error: "reused" });
  });
});
