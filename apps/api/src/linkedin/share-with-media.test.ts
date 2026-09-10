import { describe, expect, it } from "vitest";
import { createLinkedInShareWithLocalMedia } from "./share-with-media.js";

describe("official image share with stored media", () => {
  it("reuses a stored LinkedIn asset URN without a second upload", async () => {
    let ugcCalls = 0;
    const createShare = createLinkedInShareWithLocalMedia({
      async loadAsset() {
        return {
          storageKey: "ws/hash",
          linkedinAssetUrn: "urn:li:digitalmediaAsset:existing",
        };
      },
      async readBytes() {
        throw new Error("must not read bytes when URN exists");
      },
      async saveUrn() {
        throw new Error("must not overwrite an existing URN");
      },
      async ugc(input) {
        ugcCalls += 1;
        expect(input.imageAssetUrn).toBe("urn:li:digitalmediaAsset:existing");
        expect(input.imageBytes).toBeUndefined();
        return {
          httpStatus: 201,
          restliId: "urn:li:ugcPost:1",
          ...(input.imageAssetUrn
            ? { imageAssetUrn: input.imageAssetUrn }
            : {}),
        };
      },
    });
    const first = await createShare({
      accessToken: "tok",
      authorUrn: "urn:li:person:abc",
      text: "Photo",
      workspaceId: "11111111-1111-4111-8111-111111111111",
      mediaAssetId: "22222222-2222-4222-8222-222222222222",
    });
    const second = await createShare({
      accessToken: "tok",
      authorUrn: "urn:li:person:abc",
      text: "Photo",
      workspaceId: "11111111-1111-4111-8111-111111111111",
      mediaAssetId: "22222222-2222-4222-8222-222222222222",
    });
    expect(first.httpStatus).toBe(201);
    expect(second.httpStatus).toBe(201);
    expect(ugcCalls).toBe(2);
  });

  it("uploads bytes once and persists the LinkedIn asset URN", async () => {
    const saved: string[] = [];
    let reads = 0;
    const createShare = createLinkedInShareWithLocalMedia({
      async loadAsset() {
        return {
          storageKey: "ws/hash",
          linkedinAssetUrn: saved[0] ?? null,
        };
      },
      async readBytes() {
        reads += 1;
        return new Uint8Array([1, 2, 3]);
      },
      async saveUrn(_workspaceId, _mediaAssetId, urn) {
        saved.push(urn);
      },
      async ugc(input) {
        if (input.imageBytes) {
          return {
            httpStatus: 201,
            restliId: "urn:li:ugcPost:2",
            imageAssetUrn: "urn:li:digitalmediaAsset:new",
          };
        }
        expect(input.imageAssetUrn).toBe("urn:li:digitalmediaAsset:new");
        return {
          httpStatus: 201,
          restliId: "urn:li:ugcPost:2",
          ...(input.imageAssetUrn
            ? { imageAssetUrn: input.imageAssetUrn }
            : {}),
        };
      },
    });
    const input = {
      accessToken: "tok",
      authorUrn: "urn:li:person:abc",
      text: "Photo",
      workspaceId: "11111111-1111-4111-8111-111111111111",
      mediaAssetId: "22222222-2222-4222-8222-222222222222",
    };
    await createShare(input);
    await createShare(input);
    expect(saved).toEqual(["urn:li:digitalmediaAsset:new"]);
    expect(reads).toBe(1);
  });
});
