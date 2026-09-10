export type PublishCommand = {
  workspaceId: string;
  body: string;
  idempotencyKey: string;
};

export type PublishResult =
  | { kind: "verified"; externalId: string; confirmedAt: Date }
  | { kind: "platform_pending"; operationId: string }
  | { kind: "unknown_external_state"; operationId: string };

export type SocialPlatformAdapter = {
  readonly network: "linkedin";
  publish(command: PublishCommand): Promise<PublishResult>;
};

export type ProviderFailureClass =
  | "RETRYABLE"
  | "PERMANENT"
  | "UNKNOWN_EXTERNAL_STATE";

export class ProviderError extends Error {
  override readonly name = "ProviderError";

  constructor(
    readonly failureClass: ProviderFailureClass,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export function canRetryProviderCreate(
  failureClass: ProviderFailureClass,
): boolean {
  return failureClass === "RETRYABLE";
}

export function httpCreatedIsNotPublished(): false {
  return false;
}

export * from "./oauth.js";
export * from "./outbox.js";
export * from "./publish.js";
