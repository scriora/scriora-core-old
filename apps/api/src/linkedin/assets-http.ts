const restliHeaders = {
  "content-type": "application/json",
  "X-Restli-Protocol-Version": "2.0.0",
};

export async function registerLinkedInImageUpload(input: {
  accessToken: string;
  ownerUrn: string;
}): Promise<{ assetUrn: string; uploadUrl: string } | null> {
  const response = await fetch(
    "https://api.linkedin.com/v2/assets?action=registerUpload",
    {
      method: "POST",
      headers: {
        ...restliHeaders,
        authorization: `Bearer ${input.accessToken}`,
      },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
          owner: input.ownerUrn,
          serviceRelationships: [
            {
              relationshipType: "OWNER",
              identifier: "urn:li:userGeneratedContent",
            },
          ],
        },
      }),
    },
  );
  if (!response.ok) {
    return null;
  }
  const json = (await response.json()) as {
    value?: {
      asset?: string;
      uploadMechanism?: {
        "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"?: {
          uploadUrl?: string;
        };
      };
    };
  };
  const assetUrn = json.value?.asset;
  const uploadUrl =
    json.value?.uploadMechanism?.[
      "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
    ]?.uploadUrl;
  if (!assetUrn || !uploadUrl) {
    return null;
  }
  return { assetUrn, uploadUrl };
}

export async function putLinkedInImage(input: {
  uploadUrl: string;
  accessToken: string;
  bytes: Uint8Array;
}): Promise<number> {
  const response = await fetch(input.uploadUrl, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      "content-type": "application/octet-stream",
    },
    body: input.bytes,
  });
  return response.status;
}
