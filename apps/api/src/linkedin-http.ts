import { type LinkedInTokenGrant, splitLinkedInScopes } from "@scriora/social";

export async function exchangeLinkedInAuthorizationCode(input: {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}): Promise<LinkedInTokenGrant> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: input.clientId,
    client_secret: input.clientSecret,
  });
  const response = await fetch(
    "https://www.linkedin.com/oauth/v2/accessToken",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    },
  );
  if (!response.ok) {
    const text = (await response.text()).slice(0, 400);
    let detail = `http ${response.status}`;
    try {
      const parsed = JSON.parse(text) as {
        error?: string;
        error_description?: string;
      };
      detail = [parsed.error, parsed.error_description]
        .filter(Boolean)
        .join(": ");
    } catch {
      /* LinkedIn sometimes returns non-JSON */
    }
    throw new Error(`linkedin token exchange failed (${detail})`);
  }
  const json = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt:
      typeof json.expires_in === "number"
        ? new Date(Date.now() + json.expires_in * 1000)
        : null,
    scopes: splitLinkedInScopes(json.scope ?? ""),
  };
}

export async function fetchLinkedInMember(
  accessToken: string,
): Promise<{ id: string; name: string }> {
  const response = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error("linkedin member lookup failed");
  }
  const json = (await response.json()) as {
    sub: string;
    name?: string;
  };
  return { id: json.sub, name: json.name ?? json.sub };
}
