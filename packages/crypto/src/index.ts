import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function pkceChallengeS256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function hmacSha256Hex(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function hmacHexEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export type CipherRecord = {
  keyVersion: number;
  iv: Uint8Array;
  tag: Uint8Array;
  ciphertext: Uint8Array;
};

export type Vault = {
  encrypt(plaintext: Uint8Array): CipherRecord;
  decrypt(record: CipherRecord): Uint8Array;
};

const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

export function createVault(
  keys: ReadonlyMap<number, Uint8Array>,
  currentVersion: number,
): Vault {
  const current = keys.get(currentVersion);
  if (!current || current.byteLength !== KEY_LENGTH) {
    throw new Error("vault current key must be 32 bytes");
  }
  for (const key of keys.values()) {
    if (key.byteLength !== KEY_LENGTH) {
      throw new Error("vault keys must be 32 bytes");
    }
  }

  return {
    encrypt(plaintext) {
      const iv = randomBytes(IV_LENGTH);
      const cipher = createCipheriv("aes-256-gcm", current, iv);
      const ciphertext = Buffer.concat([
        cipher.update(plaintext),
        cipher.final(),
      ]);
      return {
        keyVersion: currentVersion,
        iv: new Uint8Array(iv),
        tag: new Uint8Array(cipher.getAuthTag()),
        ciphertext: new Uint8Array(ciphertext),
      };
    },
    decrypt(record) {
      const key = keys.get(record.keyVersion);
      if (!key) {
        throw new Error("unknown vault key version");
      }
      if (
        record.iv.byteLength !== IV_LENGTH ||
        record.tag.byteLength !== TAG_LENGTH
      ) {
        throw new Error("invalid vault envelope");
      }
      const decipher = createDecipheriv("aes-256-gcm", key, record.iv);
      decipher.setAuthTag(Buffer.from(record.tag));
      return new Uint8Array(
        Buffer.concat([
          decipher.update(Buffer.from(record.ciphertext)),
          decipher.final(),
        ]),
      );
    },
  };
}
