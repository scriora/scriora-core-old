"use client";

import { useEffect, useState } from "react";
import { api, workspaceStorageKey } from "../../classic/api";
import { useClassicI18n } from "../../classic/i18n";

type Queue = {
  pending: unknown[];
  processing: unknown[];
  published: unknown[];
  failed: unknown[];
};

export default function ClassicHomePage() {
  const { copy } = useClassicI18n();
  const [queue, setQueue] = useState<Queue | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const workspaceId = window.localStorage.getItem(workspaceStorageKey);
    if (!workspaceId) {
      setError(copy.workspace);
      return;
    }
    void api<Queue>(`/queue?workspaceId=${workspaceId}`).then((result) => {
      if (!result.ok) {
        setError("Queue unavailable until the API is running.");
        return;
      }
      setQueue(result.body);
    });
  }, [copy.workspace]);

  return (
    <main>
      <h1 className="m-0 font-[family-name:var(--font-display)] text-4xl">
        {copy.classicHome}
      </h1>
      <p className="mt-3 max-w-xl text-muted">{copy.composeStatus}</p>
      {error ? <p className="mt-8 text-gold">{error}</p> : null}
      {queue ? (
        <dl className="mt-10 grid max-w-3xl grid-cols-2 gap-8 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted">Pending</dt>
            <dd className="mt-2 text-3xl">{queue.pending.length}</dd>
          </div>
          <div>
            <dt className="text-muted">Dispatching</dt>
            <dd className="mt-2 text-3xl">{queue.processing.length}</dd>
          </div>
          <div>
            <dt className="text-muted">Published</dt>
            <dd className="mt-2 text-3xl">{queue.published.length}</dd>
          </div>
          <div>
            <dt className="text-muted">Failed</dt>
            <dd className="mt-2 text-3xl">{queue.failed.length}</dd>
          </div>
        </dl>
      ) : null}
    </main>
  );
}
