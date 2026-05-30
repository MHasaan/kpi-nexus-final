'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ApiError, api, getAccessToken } from '../../lib/api-client';

interface NlqAnswer {
  answer: string;
  sources: Array<{ kpiId: string; name: string }>;
  costUsd: number;
  provider: string;
  model: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  answer?: NlqAnswer;
}

export default function AskPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const ask = async (e: FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q || busy) return;
    setError(null);
    setBusy(true);
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setQuestion('');
    try {
      const res = await api<NlqAnswer>('/nlq/ask', { method: 'POST', body: JSON.stringify({ question: q }) });
      setMessages((m) => [...m, { role: 'assistant', text: res.answer, answer: res }]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ask failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-3xl items-center gap-6 px-6 py-4">
          <Link href="/kpis" className="text-lg font-semibold text-content-strong hover:text-accent-primary">
            KPI Nexus
          </Link>
          <span className="text-sm text-content-muted">Ask</span>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-6">
        <div className="flex-1 space-y-4" data-testid="ask-messages">
          {messages.length === 0 && (
            <p className="rounded-lg border border-border bg-surface-1 p-8 text-center text-content-muted" data-testid="ask-empty">
              Ask a question about your KPIs — e.g. &quot;What&apos;s our revenue trend?&quot;
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              data-testid={m.role === 'assistant' ? 'ask-answer' : 'ask-question'}
              className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
            >
              <div
                className={`max-w-[85%] rounded-lg px-4 py-3 text-sm ${
                  m.role === 'user'
                    ? 'bg-accent-primary text-white'
                    : 'border border-border bg-surface-1 text-content-strong'
                }`}
              >
                <p className="whitespace-pre-wrap">{m.text}</p>
                {m.answer && (
                  <>
                    {m.answer.sources.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2" data-testid="ask-sources">
                        {m.answer.sources.map((s) => (
                          <Link
                            key={s.kpiId}
                            href={`/kpis/${s.kpiId}`}
                            className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-accent-primary hover:underline"
                          >
                            {s.name}
                          </Link>
                        ))}
                      </div>
                    )}
                    <p className="mt-2 text-xs text-content-muted">
                      {m.answer.provider} · {m.answer.model} · ${m.answer.costUsd.toFixed(4)}
                    </p>
                  </>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {error && <p className="mt-3 text-sm text-status-critical" data-testid="ask-error">{error}</p>}

        <form onSubmit={ask} className="mt-4 flex gap-2">
          <input
            data-testid="ask-input"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about your KPIs…"
            className="flex-1 rounded-md border border-border bg-surface-1 px-4 py-2 text-sm text-content-strong outline-none focus:border-accent-primary"
          />
          <button
            type="submit"
            data-testid="ask-submit"
            disabled={busy}
            className="rounded-md bg-accent-primary px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? '…' : 'Ask'}
          </button>
        </form>
      </div>
    </main>
  );
}
