const linkedinVersion = "202605";

export async function fetchLinkedInMemberPostAnalytics(input: {
  accessToken: string;
  postUrn: string;
}): Promise<{ httpStatus: number; body: unknown }> {
  const url = new URL(
    "https://api.linkedin.com/rest/memberCreatorPostAnalytics",
  );
  url.searchParams.set("q", "entity");
  url.searchParams.set("posts", `List(${input.postUrn})`);
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      "LinkedIn-Version": linkedinVersion,
      "X-Restli-Protocol-Version": "2.0.0",
    },
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { unparsed: text };
  }
  return { httpStatus: response.status, body };
}
