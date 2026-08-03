"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { relativeTime } from "@/lib/format";
import { MailIcon, RefreshIcon } from "@/components/icons";

type MailListItem = {
  uid: string;
  from: string;
  fromAddress: string;
  subject: string;
  date: number;
  unread: boolean;
  flagged: boolean;
  account: string;
};
type Account = { id: string; label: string };
type ListResp = (
  | { connected: true; unread: number; total: number; messages: MailListItem[] }
  | { connected: false; reason: string }
) & { accounts?: Account[]; account?: string | null };

type Filter = "all" | "unread" | "starred";
type MailAction = "read" | "unread" | "star" | "unstar" | "archive" | "delete";
type FullMessage = {
  uid: string;
  from: string;
  fromAddress: string;
  to: string;
  subject: string;
  date: number;
  text: string;
  messageId: string;
  references: string;
};

export function MailClient() {
  const [list, setList] = useState<MailListItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [listErr, setListErr] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);

  const [selected, setSelected] = useState<string | null>(null);
  const [msg, setMsg] = useState<FullMessage | null>(null);
  const [loadingMsg, setLoadingMsg] = useState(false);

  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [account, setAccount] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [busyUid, setBusyUid] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const q = account ? `&account=${encodeURIComponent(account)}` : "";
      const res = await fetch(`/api/mail?limit=60${q}`, { cache: "no-store" });
      const json = (await res.json()) as ListResp;
      if (json.accounts) setAccounts(json.accounts);
      if (!account && json.account) setAccount(json.account);
      if (json.connected) {
        setList(json.messages);
        setUnread(json.unread);
        setListErr(null);
      } else {
        setListErr(json.reason);
      }
    } catch (e) {
      setListErr((e as Error).message);
    } finally {
      setLoadingList(false);
    }
  }, [account]);

  /** Flag/move a message, updating the row optimistically. */
  async function act(uid: string, action: MailAction) {
    setBusyUid(uid);
    try {
      setList((rows) =>
        action === "archive" || action === "delete"
          ? rows.filter((r) => r.uid !== uid)
          : rows.map((r) =>
              r.uid === uid
                ? {
                    ...r,
                    unread: action === "unread" ? true : action === "read" ? false : r.unread,
                    flagged: action === "star" ? true : action === "unstar" ? false : r.flagged,
                  }
                : r,
            ),
      );
      await fetch("/api/mail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, action, account }),
      });
      if (action === "archive" || action === "delete") {
        if (selected === uid) {
          setSelected(null);
          setMsg(null);
        }
      }
    } finally {
      setBusyUid(null);
      loadList();
    }
  }

  const visible = list
    .filter((m) => (filter === "unread" ? m.unread : filter === "starred" ? m.flagged : true))
    .filter((m) => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return m.subject.toLowerCase().includes(q) || m.from.toLowerCase().includes(q) || m.fromAddress.toLowerCase().includes(q);
    });

  useEffect(() => {
    loadList();
    // auto-open a message when arriving from a dashboard row (/mail?uid=…)
    const uid = new URLSearchParams(window.location.search).get("uid");
    if (uid) open(uid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadList]);

  async function open(uid: string) {
    setSelected(uid);
    setMsg(null);
    setLoadingMsg(true);
    setSendStatus(null);
    try {
      const acc = account ? `?account=${encodeURIComponent(account)}` : "";
      const res = await fetch(`/api/mail/${encodeURIComponent(uid)}${acc}`, { cache: "no-store" });
      const json = await res.json();
      if (json.ok) {
        const m = json.message as FullMessage;
        setMsg(m);
        setTo(m.fromAddress || "");
        setSubject(m.subject.startsWith("Re:") ? m.subject : `Re: ${m.subject}`);
        setReplyText("");
        // reflect the read state in the list
        setList((prev) => prev.map((x) => (x.uid === uid ? { ...x, unread: false } : x)));
      }
    } finally {
      setLoadingMsg(false);
    }
  }

  async function send() {
    if (!to.trim() || !replyText.trim() || !msg) return;
    setSending(true);
    setSendStatus(null);
    try {
      const res = await fetch("/api/mail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          subject,
          text: replyText,
          inReplyTo: msg.messageId,
          references: [msg.references, msg.messageId].filter(Boolean).join(" "),
          accountId: account,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setSendStatus({ ok: true, text: "Reply sent ✓" });
        setReplyText("");
      } else {
        setSendStatus({ ok: false, text: json.error || "Failed to send" });
      }
    } catch (e) {
      setSendStatus({ ok: false, text: (e as Error).message });
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="relative z-10 mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8 py-6">
      <header className="mb-5 flex items-center gap-4">
        <Link
          href="/"
          className="rounded-lg border border-[var(--border)] px-3 py-2 text-[13px] text-[var(--muted)] transition hover:text-[var(--accent)] hover:border-[var(--border-strong)]"
        >
          ← Dashboard
        </Link>
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--warn)]/14 text-[var(--warn)]">
          <MailIcon size={17} />
        </span>
        <h1 className="text-xl font-semibold text-[var(--text)]">Mailbox</h1>
        <span className="tnum text-[12px] text-[var(--warn)]">{unread.toLocaleString()} unread</span>

        {/* account switcher */}
        {accounts.length > 1 && (
          <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] p-0.5">
            {accounts.map((a) => (
              <button
                key={a.id}
                onClick={() => {
                  setAccount(a.id);
                  setSelected(null);
                  setMsg(null);
                }}
                className="rounded-md px-2.5 py-1 text-[12px] transition"
                style={
                  account === a.id
                    ? { background: "color-mix(in srgb, var(--accent) 16%, transparent)", color: "var(--accent)" }
                    : { color: "var(--muted)" }
                }
                title={a.label}
              >
                {a.label.split("@")[0]}
              </button>
            ))}
          </div>
        )}

        <button
          onClick={loadList}
          className="ml-auto grid h-8 w-8 place-items-center rounded-lg border border-[var(--border)] text-[var(--muted)] transition hover:text-[var(--accent)]"
          title="Refresh"
        >
          <RefreshIcon size={14} className={loadingList ? "animate-spin" : ""} />
        </button>
      </header>

      {/* filters + search */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(["all", "unread", "starred"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="rounded-md border px-2.5 py-1 text-[12px] capitalize transition"
            style={
              filter === f
                ? { borderColor: "var(--accent)", color: "var(--accent)" }
                : { borderColor: "var(--border)", color: "var(--muted)" }
            }
          >
            {f}
            {f === "unread" && unread > 0 ? ` (${unread})` : ""}
          </button>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sender or subject…"
          className="min-w-[220px] flex-1 rounded-md border border-[var(--border)] bg-transparent px-2.5 py-1.5 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)]"
        />
        <span className="text-[11px] text-[var(--faint)]">
          {visible.length} of {list.length}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">
        {/* list */}
        <section className="panel scroll-thin max-h-[76vh] overflow-y-auto p-1.5">
          {listErr && <div className="p-4 text-sm text-[var(--danger)]">{listErr}</div>}
          {!listErr && loadingList && list.length === 0 && <div className="p-4 text-sm text-[var(--muted)]">Loading inbox…</div>}
          {!listErr && !loadingList && visible.length === 0 && (
            <div className="p-4 text-sm text-[var(--muted)]">No messages match this view.</div>
          )}
          {visible.map((m) => (
            <div
              key={m.uid}
              className={`group flex items-start gap-2.5 rounded-lg px-3 py-2.5 transition ${
                selected === m.uid ? "bg-white/[0.05]" : "hover:bg-white/[0.025]"
              } ${busyUid === m.uid ? "opacity-50" : ""}`}
            >
              <button onClick={() => open(m.uid)} className="flex min-w-0 flex-1 items-start gap-2.5 text-left">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${m.unread ? "bg-[var(--warn)]" : "bg-transparent"}`} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate text-[13px] ${m.unread ? "font-semibold text-[var(--text)]" : "text-[var(--muted)]"}`}>
                      {m.from}
                    </span>
                    <span className="shrink-0 text-[10px] text-[var(--faint)]">{relativeTime(m.date)}</span>
                  </span>
                  <span className={`block truncate text-[13px] ${m.unread ? "text-[var(--text)]" : "text-[var(--muted)]"}`}>{m.subject}</span>
                </span>
              </button>
              {/* row actions */}
              <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                <MailRowAction label={m.flagged ? "Unstar" : "Star"} onClick={() => act(m.uid, m.flagged ? "unstar" : "star")} active={m.flagged}>
                  ★
                </MailRowAction>
                <MailRowAction label={m.unread ? "Mark read" : "Mark unread"} onClick={() => act(m.uid, m.unread ? "read" : "unread")}>
                  {m.unread ? "◍" : "○"}
                </MailRowAction>
                <MailRowAction label="Archive" onClick={() => act(m.uid, "archive")}>
                  ⤓
                </MailRowAction>
                <MailRowAction label="Delete" onClick={() => act(m.uid, "delete")} danger>
                  ✕
                </MailRowAction>
              </span>
              {m.flagged && <span className="mt-1 shrink-0 text-[11px] text-[var(--warn)] group-hover:hidden">★</span>}
            </div>
          ))}
        </section>

        {/* reader + reply */}
        <section className="panel flex max-h-[76vh] flex-col p-5">
          {!selected && <div className="grid flex-1 place-items-center text-sm text-[var(--muted)]">Select a message to read and reply.</div>}
          {selected && loadingMsg && <div className="text-sm text-[var(--muted)]">Loading message…</div>}
          {msg && (
            <>
              <div className="border-b border-[var(--border)] pb-3">
                <h2 className="text-lg font-semibold text-[var(--text)]">{msg.subject}</h2>
                <div className="mt-1 text-[13px] text-[var(--muted)]">
                  <span className="text-[var(--text)]">{msg.from}</span> {msg.fromAddress && `<${msg.fromAddress}>`}
                </div>
                <div className="text-[11px] text-[var(--faint)]">{new Date(msg.date).toLocaleString()}</div>
              </div>
              <div className="scroll-thin flex-1 overflow-y-auto whitespace-pre-wrap py-4 text-[13.5px] leading-relaxed text-[var(--text)]/90">
                {msg.text}
              </div>

              <div className="border-t border-[var(--border)] pt-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <label className="text-[11px] text-[var(--faint)]">To</label>
                  <input
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-white/[0.02] px-2.5 py-1.5 text-[13px] text-[var(--text)] outline-none focus:border-[var(--border-strong)]"
                  />
                </div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <label className="text-[11px] text-[var(--faint)]">Subj</label>
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-white/[0.02] px-2.5 py-1.5 text-[13px] text-[var(--text)] outline-none focus:border-[var(--border-strong)]"
                  />
                </div>
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={`Reply to ${msg.from}…`}
                  rows={4}
                  className="w-full resize-y rounded-lg border border-[var(--border)] bg-white/[0.02] px-3 py-2.5 text-[13.5px] text-[var(--text)] placeholder:text-[var(--faint)] outline-none focus:border-[var(--border-strong)]"
                />
                <div className="mt-2 flex items-center gap-3">
                  <button
                    onClick={send}
                    disabled={sending || !replyText.trim() || !to.trim()}
                    className="rounded-lg bg-[var(--accent)]/18 px-4 py-2 text-[13px] font-semibold text-[var(--accent)] transition hover:bg-[var(--accent)]/28 disabled:opacity-40"
                  >
                    {sending ? "Sending…" : "Send reply"}
                  </button>
                  {sendStatus && (
                    <span className={`text-[12px] ${sendStatus.ok ? "text-[var(--good)]" : "text-[var(--danger)]"}`}>{sendStatus.text}</span>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

/** Small icon-ish button used for the per-message row actions. */
function MailRowAction({
  label,
  onClick,
  children,
  active,
  danger,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={label}
      aria-label={label}
      className="grid h-6 w-6 place-items-center rounded text-[12px] transition hover:bg-white/[0.06]"
      style={{ color: active ? "var(--warn)" : danger ? "var(--faint)" : "var(--muted)" }}
    >
      {children}
    </button>
  );
}
