import { randomBytes } from "node:crypto";
import { createVault } from "@scriora/crypto";
import { describe, expect, it } from "vitest";
import {
  createMemoryLinkedInPublishStore,
  type LinkedInPublishPorts,
  linkedinImageShareBody,
  linkedinPersonUrn,
  linkedinTextShareBody,
  publishLinkedInText,
} from "./publish.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";

function testPorts(
  overrides: Partial<LinkedInPublishPorts> = {},
): LinkedInPublishPorts {
  const vault = createVault(new Map([[1, randomBytes(32)]]), 1);
  return {
    now: () => new Date("2026-09-10T12:00:00.000Z"),
    vault,
    store: createMemoryLinkedInPublishStore([
      {
        workspaceId,
        memberId: "urn:li:person:abc",
        canPublish: true,
        tokenEnvelope: vault.encrypt(
          new TextEncoder().encode(JSON.stringify({ accessToken: "access" })),
        ),
      },
    ]),
    async createShare() {
      return { httpStatus: 201, restliId: "urn:li:share:1" };
    },
    async verifyShare() {
      return 403;
    },
    ...overrides,
  };
}

describe("linkedin text publish", () => {
  it("builds the official ugc text share", () => {
    expect(linkedinPersonUrn("abc")).toBe("urn:li:person:abc");
    expect(
      linkedinTextShareBody("urn:li:person:abc", "Hello").specificContent[
        "com.linkedin.ugc.ShareContent"
      ].shareMediaCategory,
    ).toBe("NONE");
    expect(
      linkedinImageShareBody(
        "urn:li:person:abc",
        "Hello",
        "urn:li:digitalmediaAsset:x",
      ).specificContent["com.linkedin.ugc.ShareContent"].shareMediaCategory,
    ).toBe("IMAGE");
  });

  it("keeps 201 as pending when LinkedIn cannot be read back", async () => {
    const ports = testPorts();
    const first = await publishLinkedInText(ports, {
      workspaceId,
      idempotencyKey: "pub-1",
      text: "Hello professionals",
    });
    expect(first).toMatchObject({
      ok: true,
      attempt: {
        status: "PLATFORM_PENDING",
        externalPostId: "urn:li:share:1",
        lastError: "unverified_permission_limited",
      },
    });
  });

  it("does not create twice for the same idempotency key", async () => {
    let creates = 0;
    const ports = testPorts({
      async createShare() {
        creates += 1;
        return { httpStatus: 201, restliId: "urn:li:share:1" };
      },
    });
    const input = {
      workspaceId,
      idempotencyKey: "pub-1",
      text: "Hello professionals",
    };
    await publishLinkedInText(ports, input);
    const second = await publishLinkedInText(ports, input);
    expect(creates).toBe(1);
    expect(second).toMatchObject({
      ok: true,
      attempt: { status: "PLATFORM_PENDING", externalPostId: "urn:li:share:1" },
    });
  });

  it("marks succeeded only after a 200 verify", async () => {
    const ports = testPorts({
      async verifyShare() {
        return 200;
      },
    });
    const result = await publishLinkedInText(ports, {
      workspaceId,
      idempotencyKey: "pub-1",
      text: "Hello professionals",
    });
    expect(result).toMatchObject({
      ok: true,
      attempt: { status: "SUCCEEDED", externalPostId: "urn:li:share:1" },
    });
  });

  it("never retries create after an ambiguous provider response", async () => {
    let creates = 0;
    const ports = testPorts({
      async createShare() {
        creates += 1;
        return { httpStatus: 201, restliId: null };
      },
    });
    const input = {
      workspaceId,
      idempotencyKey: "pub-1",
      text: "Hello professionals",
    };
    const first = await publishLinkedInText(ports, input);
    const second = await publishLinkedInText(ports, input);
    expect(creates).toBe(1);
    expect(first).toMatchObject({
      ok: true,
      attempt: { status: "UNKNOWN_EXTERNAL_STATE" },
    });
    expect(second).toMatchObject({
      ok: true,
      attempt: { status: "UNKNOWN_EXTERNAL_STATE" },
    });
  });

  it("rejects the same key when the text fingerprint changes", async () => {
    const ports = testPorts();
    await publishLinkedInText(ports, {
      workspaceId,
      idempotencyKey: "pub-1",
      text: "Hello professionals",
    });
    const changed = await publishLinkedInText(ports, {
      workspaceId,
      idempotencyKey: "pub-1",
      text: "A different post",
    });
    expect(changed).toEqual({ ok: false, error: "conflict" });
  });

  it("passes media asset id on image publish and does not create twice", async () => {
    const seen: Array<string | undefined> = [];
    const ports = testPorts({
      async createShare(input) {
        seen.push(input.mediaAssetId);
        return { httpStatus: 201, restliId: "urn:li:share:img" };
      },
    });
    const input = {
      workspaceId,
      idempotencyKey: "img-1",
      text: "With photo",
      mediaAssetId: "33333333-3333-4333-8333-333333333333",
    };
    await publishLinkedInText(ports, input);
    await publishLinkedInText(ports, input);
    expect(seen).toEqual(["33333333-3333-4333-8333-333333333333"]);
  });
});
