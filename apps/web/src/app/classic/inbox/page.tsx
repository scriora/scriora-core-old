"use client";

import { useEffect, useState } from "react";
import {
  api,
  operatorEmailKey,
  operatorNameKey,
  workspaceStorageKey,
} from "../../../classic/api";
import { useClassicI18n } from "../../../classic/i18n";

type Inbox = {
  approvals: Array<{ id: string; contentId: string; status: string }>;
  history: Array<{
    id: string;
    contentId: string;
    status: string;
    decidedBy: string | null;
    decidedAt: string | null;
  }>;
  deadLetters: Array<{
    id: string;
    lastError?: string;
    idempotencyKey: string;
  }>;
};

export default function InboxPage() {
  const { copy } = useClassicI18n();
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [message, setMessage] = useState("");

  async function refresh() {
    const workspaceId = window.localStorage.getItem(workspaceStorageKey);
    if (!workspaceId) {
      return;
    }
    const result = await api<Inbox>(`/inbox?workspaceId=${workspaceId}`);
    if (result.ok) {
      setInbox(result.body);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function decide(id: string, decision: "APPROVED" | "REJECTED") {
    const workspaceId = window.localStorage.getItem(workspaceStorageKey);
    if (!workspaceId) {
      return;
    }
    const result = await api(`/approvals/${id}/decide`, {
      method: "POST",
      body: JSON.stringify({
        workspaceId,
        decision,
        actor:
          window.localStorage.getItem(operatorNameKey) ||
          window.localStorage.getItem(operatorEmailKey) ||
          "classic-operator",
      }),
    });
    setMessage(result.ok ? decision : "Decision failed.");
    await refresh();
  }

  return (
    <main className="max-w-3xl">
      <h1 className="m-0 font-[family-name:var(--font-display)] text-4xl">
        {copy.classicInbox}
      </h1>
      <section className="mt-10">
        <h2 className="text-lg">{copy.pendingReviews}</h2>
        <ul className="mt-4 list-none space-y-4 p-0">
          {inbox?.approvals.map((item) => (
            <li key={item.id} className="flex flex-wrap gap-3">
              <span className="text-sm text-muted">{item.contentId}</span>
              <button
                type="button"
                className="min-h-11 border border-gold px-4 text-gold"
                onClick={() => void decide(item.id, "APPROVED")}
              >
                {copy.approve}
              </button>
              <button
                type="button"
                className="min-h-11 border border-rule px-4"
                onClick={() => void decide(item.id, "REJECTED")}
              >
                {copy.reject}
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-12">
        <h2 className="text-lg">{copy.approvalHistory}</h2>
        <ul className="mt-4 list-none space-y-3 p-0 text-sm text-muted">
          {inbox?.history.map((item) => (
            <li key={item.id}>
              {item.status}
              {item.decidedBy ? ` · ${item.decidedBy}` : ""}
              {item.decidedAt ? ` · ${item.decidedAt}` : ""}
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-12">
        <h2 className="text-lg">{copy.deadLetters}</h2>
        <ul className="mt-4 list-none space-y-3 p-0 text-sm text-muted">
          {inbox?.deadLetters.map((item) => (
            <li key={item.id}>
              {item.idempotencyKey}
              {item.lastError ? ` · ${item.lastError}` : ""}
            </li>
          ))}
        </ul>
      </section>
      {message ? <p className="mt-6 text-sm text-gold">{message}</p> : null}
    </main>
  );
}
