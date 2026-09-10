export const workspaceStorageKey = "scriora.workspaceId";
export const operatorEmailKey = "scriora.operatorEmail";
export const operatorNameKey = "scriora.operatorName";
export const operatorUserIdKey = "scriora.operatorUserId";

export async function api<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; body: T }> {
  const response = await fetch(`/scriora-api${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  let body: T;
  try {
    body = (text ? JSON.parse(text) : null) as T;
  } catch {
    body = text as T;
  }
  return { ok: response.ok, status: response.status, body };
}
