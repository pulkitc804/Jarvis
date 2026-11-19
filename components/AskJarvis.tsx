'use client';
import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
type Message = { role: 'user' | 'assistant'; content: string };
const suggestions = ['Which roles should I apply to next?', 'What deadlines are coming up?', 'Summarize my application pipeline.'];
export function AskJarvis() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [stamp, setStamp] = useState('');
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!question.trim() || pending) return;
    const next: Message[] = [...messages.slice(-14), { role: 'user', content: question.trim() }];
    setMessages(next); setQuestion(''); setError(''); setPending(true);
    const controller = new AbortController(); abort.current = controller;
    try {
      const res = await fetch('/api/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: next }), signal: controller.signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to answer.');
      setMessages([...next, { role: 'assistant', content: data.answer }]);
      setStamp(new Date(data.capturedAt).toLocaleString());
    } catch (e) { setError((e as Error).name === 'AbortError' ? 'Stopped.' : (e as Error).message); }
    finally { setPending(false); }
  }
  return <main className="mx-auto max-w-3xl px-5 py-8">
    <Link href="/" className="text-sm text-[var(--muted)]">← Dashboard</Link>
    <div className="mt-6 flex items-center justify-between"><h1 className="text-2xl font-semibold">Ask Jarvis</h1><button disabled={pending} onClick={() => { setMessages([]); setError(''); setStamp(''); }} className="text-sm text-[var(--muted)] disabled:opacity-40">New chat</button></div>
    <p className="mt-2 text-sm text-[var(--muted)]">Ask about your roles, programs, deadlines and tasks. Uses your signed-in Codex subscription allowance. Read-only; chat stays in this tab.</p>
    <p className="mt-2 text-xs text-[var(--faint)]">Your question and dashboard snapshot are sent to OpenAI through Codex. Email bodies and credentials are excluded.</p>
    {!messages.length && <div className="my-8 flex flex-wrap gap-2">{suggestions.map(q => <button key={q} onClick={() => setQuestion(q)} className="panel px-3 py-2 text-sm">{q}</button>)}</div>}
    <div role="log" aria-live="polite" className="my-6 space-y-4">{messages.map((m, i) => <article key={i} className="panel p-4"><div className="mb-2 text-xs font-semibold text-[var(--muted)]">{m.role === 'user' ? 'You' : 'Jarvis'}</div><p className="whitespace-pre-wrap break-words text-sm leading-7">{m.content}</p></article>)}</div>
    {pending && <p role="status" className="mb-3 text-sm text-[var(--muted)]">Checking your dashboard…</p>}
    {error && <p role="alert" className="mb-3 text-sm text-[var(--danger)]">{error}</p>}
    <form onSubmit={submit} className="panel p-3"><label htmlFor="question" className="sr-only">Question for Jarvis</label><textarea id="question" value={question} onChange={e => setQuestion(e.target.value)} maxLength={6000} rows={3} placeholder="Ask Jarvis…" className="w-full resize-y bg-transparent p-2 text-sm outline-none" /><div className="flex justify-end gap-3">{pending ? <button type="button" onClick={() => abort.current?.abort()} className="px-4 py-2 text-sm">Stop</button> : <button disabled={!question.trim()} className="rounded border border-[var(--border)] px-4 py-2 text-sm disabled:opacity-40">Ask</button>}</div></form>
    {stamp && <p className="mt-3 text-xs text-[var(--faint)]">Snapshot captured {stamp}. Each question reads fresh data.</p>}
  </main>;
}
