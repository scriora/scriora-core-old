import { linkedinTextShareBody } from "@scriora/social";

const restliHeaders = {
  "content-type": "application/json",
  "X-Restli-Protocol-Version": "2.0.0",
};

export async function createLinkedInTextShare(input: {
  accessToken: string;
  authorUrn: string;
  text: string;
}): Promise<{ httpStatus: number; restliId: string | null }> {
  const response = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      ...restliHeaders,
      authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify(linkedinTextShareBody(input.authorUrn, input.text)),
  });
  return {
    httpStatus: response.status,
    restliId: response.headers.get("x-restli-id") ?? null,
  };
}

export async function verifyLinkedInShare(input: {
  accessToken: string;
  restliId: string;
}): Promise<number> {
  const response = await fetch(
    `https://api.linkedin.com/v2/ugcPosts/${encodeURIComponent(input.restliId)}`,
    {
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        "X-Restli-Protocol-Version": "2.0.0",
      },
    },
  );
  return response.status;
}
