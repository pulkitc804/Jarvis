"use client";

import { useState } from "react";
import { Panel } from "@/components/Panel";
import { usePoll } from "@/lib/usePoll";
import { PlusIcon, TrashIcon } from "@/components/icons";

const UsersIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

type Referral = { id: string; company: string; contactName: string; relation: string; contacted: boolean };
type Resp = { referrals: Referral[]; gaps: string[]; contactedCount: number };

export function ReferralsWidget() {
  const { data, refresh } = usePoll<Resp>("/api/referrals", 60000);
  const [company, setCompany] = useState("");
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("");

  async function add() {
    if (!company.trim() || !name.trim()) return;
    await fetch("/api/referrals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company, contactName: name, relation }),
    });
    setCompany("");
    setName("");
    setRelation("");
    refresh();
  }

  async function toggle(r: Referral) {
    await fetch("/api/referrals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id, contacted: !r.contacted }),
    });
    refresh();
  }

  async function remove(r: Referral) {
    await fetch(`/api/referrals?id=${encodeURIComponent(r.id)}`, { method: "DELETE" });
    refresh();
  }

  const rows = data?.referrals || [];

  return (
    <Panel
      title="Referrals"
      icon={<UsersIcon size={16} />}
      accent="var(--accent2)"
      className="lg:col-span-7"
      right={data ? <span className="text-[11px] text-[var(--faint)]">{data.contactedCount}/{rows.length} reached out</span> : null}
    >
      <div className="flex h-full flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Company"
            className="w-28 rounded-lg border border-[var(--border)] bg-transparent px-2.5 py-1.5 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)]"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Contact name"
            className="w-32 rounded-lg border border-[var(--border)] bg-transparent px-2.5 py-1.5 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)]"
          />
          <input
            value={relation}
            onChange={(e) => setRelation(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="How you know them"
            className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-transparent px-2.5 py-1.5 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)]"
          />
          <button onClick={add} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--accent2)]/20 text-[var(--accent2)] transition hover:bg-[var(--accent2)]/30">
            <PlusIcon size={15} />
          </button>
        </div>

        <div className="space-y-1">
          {rows.length === 0 && (
            <div className="text-[13px] text-[var(--muted)]">
              No contacts yet — warm intros beat cold applications, so add anyone you know at these companies.
            </div>
          )}
          {rows.slice(0, 6).map((r) => (
            <div key={r.id} className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-white/[0.025]">
              <button
                onClick={() => toggle(r)}
                className="grid h-4 w-4 shrink-0 place-items-center rounded border transition"
                style={{ borderColor: r.contacted ? "var(--good)" : "var(--border-strong)", background: r.contacted ? "var(--good)" : "transparent" }}
                title={r.contacted ? "Reached out" : "Mark as reached out"}
              >
                {r.contacted && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#05080f" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                )}
              </button>
              <span className="w-24 shrink-0 truncate text-[13px] font-medium text-[var(--text)]">{r.company}</span>
              <span className="shrink-0 truncate text-[13px] text-[var(--muted)]">{r.contactName}</span>
              {r.relation && <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--faint)]">{r.relation}</span>}
              <button onClick={() => remove(r)} className="ml-auto shrink-0 text-[var(--faint)] opacity-0 transition group-hover:opacity-100 hover:text-[var(--danger)]">
                <TrashIcon size={13} />
              </button>
            </div>
          ))}
        </div>

        {data && data.gaps.length > 0 && (
          <div className="mt-auto border-t border-[var(--border)] pt-2.5">
            <div className="mb-1.5 label">No contact yet at</div>
            <div className="flex flex-wrap gap-1">
              {data.gaps.slice(0, 8).map((g) => (
                <button
                  key={g}
                  onClick={() => setCompany(g)}
                  className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[11px] text-[var(--muted)] transition hover:border-[var(--accent2)] hover:text-[var(--accent2)]"
                  title={`Add a contact at ${g}`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
