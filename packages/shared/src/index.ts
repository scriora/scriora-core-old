export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export type FeatureStatus = "live" | "planned";

export const featureInventory = {
  classicCompose: "planned",
  linkedinOauth: "planned",
  publishLedger: "planned",
  tenantRls: "planned",
  missionMode: "planned",
  unofficialApis: "rejected",
} as const;

export type FeatureInventory = typeof featureInventory;
