import { linkedinImageShareBody, linkedinTextShareBody } from "@scriora/social";
import {
  putLinkedInImage,
  registerLinkedInImageUpload,
} from "./assets-http.js";

const restliHeaders = {
  "content-type": "application/json",
  "X-Restli-Protocol-Version": "2.0.0",
};

export async function createLinkedInTextShare(input: {
  accessToken: string;
  authorUrn: string;
  text: string;
  mediaAssetId?: string;
  imageAssetUrn?: string | null;
  imageBytes?: Uint8Array;
}): Promise<{
  httpStatus: number;
  restliId: string | null;
  imageAssetUrn?: string;
}> {
  let assetUrn = input.imageAssetUrn ?? null;
  if (!assetUrn && input.imageBytes && input.imageBytes.byteLength > 0) {
    const registered = await registerLinkedInImageUpload({
      accessToken: input.accessToken,
      ownerUrn: input.authorUrn,
    });
    if (!registered) {
      return { httpStatus: 400, restliId: null };
    }
    const uploaded = await putLinkedInImage({
      uploadUrl: registered.uploadUrl,
      accessToken: input.accessToken,
      bytes: input.imageBytes,
    });
    if (uploaded >= 400) {
      return { httpStatus: uploaded, restliId: null };
    }
    assetUrn = registered.assetUrn;
  }
  const body = assetUrn
    ? linkedinImageShareBody(input.authorUrn, input.text, assetUrn)
    : linkedinTextShareBody(input.authorUrn, input.text);
  const response = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      ...restliHeaders,
      authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify(body),
  });
  return {
    httpStatus: response.status,
    restliId: response.headers.get("x-restli-id") ?? null,
    ...(assetUrn ? { imageAssetUrn: assetUrn } : {}),
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
