import type { CipherRecord, Vault } from "@scriora/crypto";
import { pkceChallengeS256, randomToken, sha256Hex } from "@scriora/crypto";
import { inspectOAuthPending, oauthStateTtlMs } from "@scriora/domain";

export type LinkedInCapabilityManifest = {
  network: "linkedin";
  oauth: boolean;
  publish: boolean;
  comments: boolean;
  analytics: boolean;
  inbox: boolean;
};

export const linkedinCapabilityManifest: LinkedInCapabilityManifest = {
  network: "linkedin",
  oauth: false,
  publish: false,
  comments: false,
  analytics: false,
  inbox: false,
};

export function capabilitiesFromGrantedScopes(
  scopes: readonly string[],
): LinkedInCapabilityManifest {
  const granted = new Set(scopes);
  return {
    network: "linkedin",
    oauth: true,
    publish: granted.has("w_member_social"),
    comments: false,
    analytics:
      granted.has("r_member_postAnalytics") ||
      granted.has("r_member_profileAnalytics"),
    inbox: false,
  };
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type LinkedInTokenGrant = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string[];
};

export type PublicLinkedInAccount = {
  platform: "linkedin";
  externalAccountId: string;
  displayName: string;
  grantedScopes: string[];
  capabilities: LinkedInCapabilityManifest;
  refreshMode: "refresh" | "reauthorize";
  tokenExpiresAt: Date | null;
};

export type OAuthPendingRecord = {
  workspaceId: string;
  stateHash: string;
  redirectUri: string;
  envelope: CipherRecord;
  expiresAt: Date;
  consumedAt: Date | null;
};

export type LinkedInOAuthStore = {
  savePending(record: OAuthPendingRecord): Promise<void>;
  takePending(
    workspaceId: string,
    stateHash: string,
  ): Promise<OAuthPendingRecord | null>;
  saveConnectedAccount(input: {
    workspaceId: string;
    account: PublicLinkedInAccount;
    tokenEnvelope: CipherRecord;
  }): Promise<void>;
};

export type LinkedInOAuthPorts = {
  now(): Date;
  vault: Vault;
  store: LinkedInOAuthStore;
  clientId: string;
  redirectUri: string;
  requestedScopes: string;
  exchangeAuthorizationCode(input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<LinkedInTokenGrant>;
  fetchMember(accessToken: string): Promise<{ id: string; name: string }>;
};

export function createMemoryLinkedInOAuthStore(): LinkedInOAuthStore {
  const pending = new Map<string, OAuthPendingRecord>();
  return {
    async savePending(record) {
      pending.set(`${record.workspaceId}:${record.stateHash}`, record);
    },
    async takePending(workspaceId, stateHash) {
      const key = `${workspaceId}:${stateHash}`;
      const record = pending.get(key);
      if (!record) {
        return null;
      }
      pending.delete(key);
      return record;
    },
    async saveConnectedAccount() {
      /* tokens stay in the vault caller; persistence is the postgres store */
    },
  };
}

export function workspaceIdFromOAuthState(state: string): string | null {
  const workspaceId = state.split(".")[0];
  if (!workspaceId || !uuidPattern.test(workspaceId)) {
    return null;
  }
  return workspaceId;
}

export function splitLinkedInScopes(scope: string): string[] {
  return scope
    .split(/[ ,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function createLinkedInAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes: string;
  codeChallenge: string;
}): string {
  const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("scope", input.scopes);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function startLinkedInConnect(
  ports: LinkedInOAuthPorts,
  workspaceId: string,
): Promise<{ authorizationUrl: string }> {
  const state = `${workspaceId}.${randomToken()}`;
  const verifier = randomToken();
  const now = ports.now();
  const envelope = ports.vault.encrypt(new TextEncoder().encode(verifier));
  await ports.store.savePending({
    workspaceId,
    stateHash: sha256Hex(state),
    redirectUri: ports.redirectUri,
    envelope,
    expiresAt: new Date(now.getTime() + oauthStateTtlMs),
    consumedAt: null,
  });
  return {
    authorizationUrl: createLinkedInAuthorizationUrl({
      clientId: ports.clientId,
      redirectUri: ports.redirectUri,
      state,
      scopes: ports.requestedScopes,
      codeChallenge: pkceChallengeS256(verifier),
    }),
  };
}

export async function finishLinkedInConnect(
  ports: LinkedInOAuthPorts,
  input: { code: string; state: string },
): Promise<
  | { ok: true; account: PublicLinkedInAccount }
  | { ok: false; error: "invalid_state" | "expired" | "reused" }
> {
  const workspaceId = workspaceIdFromOAuthState(input.state);
  if (!workspaceId) {
    return { ok: false, error: "invalid_state" };
  }
  const pending = await ports.store.takePending(
    workspaceId,
    sha256Hex(input.state),
  );
  if (!pending) {
    return { ok: false, error: "reused" };
  }
  const decision = inspectOAuthPending({
    consumedAt: null,
    expiresAt: pending.expiresAt,
    now: ports.now(),
  });
  if (decision !== "ok") {
    return { ok: false, error: decision };
  }
  const verifier = new TextDecoder().decode(
    ports.vault.decrypt(pending.envelope),
  );
  const grant = await ports.exchangeAuthorizationCode({
    code: input.code,
    codeVerifier: verifier,
    redirectUri: pending.redirectUri,
  });
  const member = await ports.fetchMember(grant.accessToken);
  const account: PublicLinkedInAccount = {
    platform: "linkedin",
    externalAccountId: member.id,
    displayName: member.name,
    grantedScopes: grant.scopes,
    capabilities: capabilitiesFromGrantedScopes(grant.scopes),
    refreshMode: grant.refreshToken ? "refresh" : "reauthorize",
    tokenExpiresAt: grant.expiresAt,
  };
  await ports.store.saveConnectedAccount({
    workspaceId,
    account,
    tokenEnvelope: ports.vault.encrypt(
      new TextEncoder().encode(
        JSON.stringify({
          accessToken: grant.accessToken,
          refreshToken: grant.refreshToken,
        }),
      ),
    ),
  });
  return { ok: true, account };
}
