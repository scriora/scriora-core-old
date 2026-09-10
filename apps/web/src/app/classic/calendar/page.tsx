"use client";

import { useEffect, useMemo, useState } from "react";
import { api, workspaceStorageKey } from "../../../classic/api";
import { useClassicI18n } from "../../../classic/i18n";
import {
  dayKeyInTimeZone,
  defaultDisplayTimeZone,
  formatInTimeZone,
  timezoneStorageKey,
  wallClockToUtc,
} from "../../../classic/timezone";

type Content = {
  id: string;
  status: string;
  body: string;
  scheduledAt: string | null;
};

export default function CalendarPage() {
  const { copy } = useClassicI18n();
  const [items, setItems] = useState<Content[]>([]);
  const [when, setWhen] = useState("");
  const [timeZone, setTimeZone] = useState(defaultDisplayTimeZone);
  const [message, setMessage] = useState("");

  async function refresh() {
    const workspaceId = window.localStorage.getItem(workspaceStorageKey);
    if (!workspaceId) {
      return;
    }
    const result = await api<Content[]>(`/contents?workspaceId=${workspaceId}`);
    if (result.ok) {
      setItems(result.body);
    }
  }

  useEffect(() => {
    const stored =
      window.localStorage.getItem(timezoneStorageKey) ?? defaultDisplayTimeZone;
    setTimeZone(stored);
    void refresh();
  }, []);

  const grouped = useMemo(() => {
    const buckets = new Map<string, Content[]>();
    for (const item of items) {
      const key = item.scheduledAt
        ? dayKeyInTimeZone(item.scheduledAt, timeZone)
        : "unscheduled";
      const list = buckets.get(key) ?? [];
      list.push(item);
      buckets.set(key, list);
    }
    return [...buckets.entries()];
  }, [items, timeZone]);

  async function schedule(contentId: string, method: "POST" | "PATCH") {
    const workspaceId = window.localStorage.getItem(workspaceStorageKey);
    if (!workspaceId || !when) {
      setMessage(copy.scheduleAt);
      return;
    }
    const scheduledAt = wallClockToUtc(when, timeZone);
    const result = await api(`/contents/${contentId}/schedule`, {
      method,
      body: JSON.stringify({
        workspaceId,
        idempotencyKey: `schedule:${contentId}`,
        scheduledAt,
      }),
    });
    setMessage(
      result.ok
        ? scheduledAt
        : result.status === 409
          ? "Time already taken."
          : "Schedule blocked.",
    );
    await refresh();
  }

  return (
    <main className="max-w-3xl">
      <h1 className="m-0 font-[family-name:var(--font-display)] text-4xl">
        {copy.classicCalendar}
      </h1>
      <label className="mt-6 block text-sm text-muted">
        {copy.timezone}
        <select
          value={timeZone}
          onChange={(event) => {
            setTimeZone(event.target.value);
            window.localStorage.setItem(timezoneStorageKey, event.target.value);
          }}
          className="mt-2 block min-h-11 border border-rule bg-ink px-3 text-paper"
        >
          <option value="America/New_York">America/New_York</option>
          <option value="UTC">UTC</option>
          <option value="Europe/London">Europe/London</option>
          <option value="Asia/Riyadh">Asia/Riyadh</option>
        </select>
      </label>
      <label className="mt-6 block text-sm text-muted">
        {copy.scheduleAt}
        <input
          type="datetime-local"
          value={when}
          onChange={(event) => setWhen(event.target.value)}
          className="mt-2 block min-h-11 border border-rule bg-ink px-3 text-paper"
        />
      </label>
      {grouped.map(([day, rows]) => (
        <section key={day} className="mt-10">
          <h2 className="text-lg text-gold">{day}</h2>
          <ul className="mt-4 list-none space-y-6 p-0">
            {rows.map((item) => (
              <li key={item.id} className="border-t border-rule pt-4">
                <p className="text-xs uppercase tracking-widest text-gold">
                  {item.status}
                  {item.scheduledAt
                    ? ` · ${formatInTimeZone(item.scheduledAt, timeZone)}`
                    : ""}
                </p>
                <p className="mt-2 whitespace-pre-wrap">{item.body}</p>
                {item.status === "APPROVED" ? (
                  <button
                    type="button"
                    className="mt-3 min-h-11 border border-gold px-4 text-sm text-gold"
                    onClick={() => void schedule(item.id, "POST")}
                  >
                    {copy.scheduleAt}
                  </button>
                ) : null}
                {item.status === "SCHEDULED" ? (
                  <button
                    type="button"
                    className="mt-3 min-h-11 border border-gold px-4 text-sm text-gold"
                    onClick={() => void schedule(item.id, "PATCH")}
                  >
                    {copy.reschedule}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {message ? <p className="mt-4 text-sm text-muted">{message}</p> : null}
    </main>
  );
}
