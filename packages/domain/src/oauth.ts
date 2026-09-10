export const oauthStateTtlMs = 10 * 60 * 1000;

export type OAuthPendingDecision = "ok" | "expired" | "reused";

export function inspectOAuthPending(input: {
  consumedAt: Date | null;
  expiresAt: Date;
  now: Date;
}): OAuthPendingDecision {
  if (input.consumedAt) {
    return "reused";
  }
  if (input.now >= input.expiresAt) {
    return "expired";
  }
  return "ok";
}
