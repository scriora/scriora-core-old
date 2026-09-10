"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import {
  api,
  operatorEmailKey,
  operatorNameKey,
  operatorUserIdKey,
  workspaceStorageKey,
} from "./api";
import { useClassicI18n } from "./i18n";

type Workspace = { id: string; name: string };

export function ClassicShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { copy, locale, setLocale } = useClassicI18n();
  const [workspaceId, setWorkspaceId] = useState("");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [newName, setNewName] = useState("");
  const [paused, setPaused] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);

  const links = [
    { href: "/classic", label: copy.classicHome },
    { href: "/classic/compose", label: copy.classicCompose },
    { href: "/classic/calendar", label: copy.classicCalendar },
    { href: "/classic/inbox", label: copy.classicInbox },
    { href: "/classic/media", label: copy.classicMedia },
    { href: "/classic/status", label: copy.classicStatus },
  ];

  useEffect(() => {
    const stored = window.localStorage.getItem(workspaceStorageKey) ?? "";
    const storedEmail = window.localStorage.getItem(operatorEmailKey) ?? "";
    const storedUser = window.localStorage.getItem(operatorUserIdKey) ?? "";
    setWorkspaceId(stored);
    setEmail(storedEmail);
    setUserId(storedUser);
    if (storedUser) {
      void api<Workspace[]>(`/workspaces?userId=${storedUser}`).then(
        (result) => {
          if (result.ok) {
            setWorkspaces(result.body);
          }
        },
      );
    }
  }, []);

  async function signIn() {
    const result = await api<{ userId: string; email: string; name: string }>(
      "/session",
      {
        method: "POST",
        body: JSON.stringify({ email, name: email.split("@")[0] }),
      },
    );
    if (!result.ok) {
      return;
    }
    setUserId(result.body.userId);
    window.localStorage.setItem(operatorEmailKey, result.body.email);
    window.localStorage.setItem(operatorNameKey, result.body.name);
    window.localStorage.setItem(operatorUserIdKey, result.body.userId);
    const listed = await api<Workspace[]>(
      `/workspaces?userId=${result.body.userId}`,
    );
    if (listed.ok) {
      setWorkspaces(listed.body);
    }
  }

  useEffect(() => {
    if (!workspaceId) {
      return;
    }
    window.localStorage.setItem(workspaceStorageKey, workspaceId);
    void api<{ dispatchPaused: boolean }>(
      `/autonomy?workspaceId=${workspaceId}`,
    ).then((result) => {
      if (result.ok) {
        setPaused(result.body.dispatchPaused);
      }
    });
    void api<{ needsReauth: boolean; connected: boolean }>(
      `/integrations/linkedin?workspaceId=${workspaceId}`,
    ).then((result) => {
      if (result.ok) {
        setNeedsReauth(result.body.needsReauth || !result.body.connected);
      }
    });
  }, [workspaceId]);

  async function createWorkspace() {
    const result = await api<Workspace>("/workspaces", {
      method: "POST",
      body: JSON.stringify({ name: newName, userId }),
    });
    if (!result.ok) {
      return;
    }
    setWorkspaces((current) => [result.body, ...current]);
    setWorkspaceId(result.body.id);
    setNewName("");
  }

  async function toggleKillswitch() {
    if (!workspaceId) {
      return;
    }
    const result = await api<{ dispatchPaused: boolean }>("/autonomy", {
      method: "PUT",
      body: JSON.stringify({
        workspaceId,
        dispatchPaused: !paused,
      }),
    });
    if (result.ok) {
      setPaused(result.body.dispatchPaused);
    }
  }

  return (
    <div className="min-h-svh bg-ink text-paper md:flex">
      <aside className="flex w-full shrink-0 flex-col gap-8 border-b border-rule px-6 py-6 md:h-svh md:w-[260px] md:border-e md:border-b-0">
        <Link href="/" className="text-gold no-underline">
          {copy.brand}
        </Link>
        <nav className="flex flex-col gap-1 text-sm">
          {links.map((link) => {
            const active =
              link.href === "/classic"
                ? pathname === "/classic"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={
                  active
                    ? "border-s-2 border-gold ps-3 text-gold no-underline"
                    : "border-s-2 border-transparent ps-3 text-muted no-underline"
                }
              >
                {link.label}
                {link.href === "/classic/status" && needsReauth ? " · !" : ""}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center gap-3 border-b border-rule px-6 py-4">
          <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted">
            {copy.workspace}
            <select
              value={workspaceId}
              onChange={(event) => setWorkspaceId(event.target.value)}
              className="min-h-11 min-w-0 flex-1 border border-rule bg-ink px-3 text-paper"
            >
              <option value="">{copy.workspace}</option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </label>
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="operator@scriora.test"
            className="min-h-11 min-w-40 border border-rule bg-ink px-3 text-paper"
          />
          <button
            type="button"
            onClick={() => void signIn()}
            className="min-h-11 border border-rule px-4 text-sm"
          >
            Sign in
          </button>
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder={copy.newWorkspace}
            className="min-h-11 min-w-40 border border-rule bg-ink px-3 text-paper"
          />
          <button
            type="button"
            onClick={() => void createWorkspace()}
            className="min-h-11 border border-rule px-4 text-sm"
          >
            {copy.newWorkspace}
          </button>
          <button
            type="button"
            onClick={() => setLocale(locale === "en" ? "ar" : "en")}
            className="min-h-11 border border-rule px-4 text-sm"
          >
            {copy.language}: {locale === "en" ? "AR" : "EN"}
          </button>
          <button
            type="button"
            onClick={() => void toggleKillswitch()}
            className="min-h-11 shrink-0 border border-gold px-4 text-sm text-gold"
          >
            {copy.killswitch}
            {paused ? " · on" : ""}
          </button>
        </header>
        <div className="px-6 py-8">{children}</div>
      </div>
    </div>
  );
}
