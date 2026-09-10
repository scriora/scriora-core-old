"use client";

import { useEffect, useState } from "react";
import { api, workspaceStorageKey } from "../../../classic/api";
import { useClassicI18n } from "../../../classic/i18n";
import { telemetryValueLabel } from "../../../classic/telemetry-copy";

type Content = {
  id: string;
  status: string;
  body: string;
  originMode: string;
  source: string;
};

type LinkedInStatus = {
  connected: boolean;
  memberUrn: string | null;
  displayName: string | null;
  tokenExpiresAt: string | null;
  needsReauth: boolean;
};

type TelemetryRow = {
  dataCapability: string;
  metrics: Array<{ metric: string; value: number | null; status: string }>;
};

export default function StatusPage() {
  const { copy } = useClassicI18n();
  const [items, setItems] = useState<Content[]>([]);
  const [linkedin, setLinkedin] = useState<LinkedInStatus | null>(null);
  const [message, setMessage] = useState("");
  const [metrics, setMetrics] = useState<TelemetryRow[] | null>(null);

  useEffect(() => {
    const workspaceId = window.localStorage.getItem(workspaceStorageKey);
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("linkedin");
    if (flag) {
      window.history.replaceState({}, "", "/classic/status");
      setMessage(
        flag === "connected"
          ? "LinkedIn connected."
          : "LinkedIn connect failed.",
      );
    }
    if (!workspaceId) {
      return;
    }
    void api<Content[]>(`/contents?workspaceId=${workspaceId}`).then(
      (result) => {
        if (result.ok) {
          setItems(result.body);
        }
      },
    );
    void api<LinkedInStatus>(
      `/integrations/linkedin?workspaceId=${workspaceId}`,
    ).then((result) => {
      if (result.ok) {
        setLinkedin(result.body);
      }
    });
  }, []);

  async function connect() {
    const workspaceId = window.localStorage.getItem(workspaceStorageKey);
    if (!workspaceId) {
      return;
    }
    const result = await api<{ authorizationUrl: string }>(
      "/integrations/linkedin/connect",
      {
        method: "POST",
        body: JSON.stringify({ workspaceId }),
      },
    );
    if (result.ok) {
      window.location.assign(result.body.authorizationUrl);
    }
  }

  async function measure(id: string) {
    const workspaceId = window.localStorage.getItem(workspaceStorageKey);
    if (!workspaceId) {
      return;
    }
    const idempotencyKey = `schedule:${id}`;
    const polled = await api("/publications/telemetry/poll", {
      method: "POST",
      body: JSON.stringify({
        workspaceId,
        idempotencyKey,
      }),
    });
    const listed = await api<TelemetryRow[]>(
      `/publications/telemetry?workspaceId=${workspaceId}&idempotencyKey=${idempotencyKey}`,
    );
    setMetrics(listed.ok ? listed.body : null);
    setMessage(
      polled.ok ? "Telemetry stored." : "No verified post for that key yet.",
    );
  }

  return (
    <main className="max-w-3xl">
      <h1 className="m-0 font-[family-name:var(--font-display)] text-4xl">
        {copy.classicStatus}
      </h1>
      <section className="mt-8 border border-rule p-4">
        <p className="m-0 text-sm text-muted">
          {linkedin?.connected
            ? `${linkedin.displayName ?? linkedin.memberUrn} · ${linkedin.tokenExpiresAt ?? ""}`
            : copy.linkedInDisconnected}
        </p>
        {linkedin?.needsReauth ? (
          <p className="mt-2 text-sm text-gold">{copy.linkedInNeedsReauth}</p>
        ) : null}
        <button
          type="button"
          className="mt-4 min-h-11 border border-gold px-4 text-gold"
          onClick={() => void connect()}
        >
          {linkedin?.connected ? copy.reauthLinkedIn : copy.connectLinkedIn}
        </button>
      </section>
      <ul className="mt-8 list-none space-y-6 p-0">
        {items.map((item) => (
          <li key={item.id} className="border-t border-rule pt-4">
            <p className="text-xs uppercase tracking-widest text-gold">
              {item.status} · {item.originMode} · {item.source}
            </p>
            <p className="mt-2 whitespace-pre-wrap">{item.body}</p>
            <button
              type="button"
              className="mt-3 min-h-11 border border-rule px-4 text-sm"
              onClick={() => void measure(item.id)}
            >
              {copy.measure}
            </button>
          </li>
        ))}
      </ul>
      {metrics ? (
        <ul className="mt-8 list-none p-0 text-sm">
          {metrics.flatMap((row) =>
            row.metrics.map((metric) => (
              <li key={`${row.dataCapability}-${metric.metric}`}>
                {metric.metric}:{" "}
                {telemetryValueLabel({
                  value: metric.value,
                  status: metric.status,
                  unavailable: copy.notAvailable,
                })}
              </li>
            )),
          )}
        </ul>
      ) : null}
      {message ? <p className="mt-4 text-sm text-muted">{message}</p> : null}
    </main>
  );
}
