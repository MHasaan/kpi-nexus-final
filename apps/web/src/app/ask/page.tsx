'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, Sparkles } from 'lucide-react';

import { ApiError, api, getAccessToken } from '../../lib/api-client';
import { AppShell } from '../../components/app-shell';
import { RequirePermission } from '../../components/auth/require-permission';
import { PageHeader, Card, Button, Badge, EmptyState } from '../../components/ui';
import { cn } from '../../lib/cn';

// Static starter prompts shown in the empty state — clicking one submits it.
const SUGGESTED_PROMPTS = [
  'Which KPIs are off track this quarter?',
  'Forecast MRR for next 3 months',
  'Compare CAC across org units',
];

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

  const submitQuestion = async (raw: string) => {
    const q = raw.trim();
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

  const ask = (e: FormEvent) => {
    e.preventDefault();
    void submitQuestion(question);
  };

  return (
    <RequirePermission permission="ANALYTICS_VIEW">
      <AppShell>
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-5">
        <PageHeader
          eyebrow="Intelligence"
          title="Ask"
          subtitle="Ask questions in plain language — answers are grounded in your visible data and respect your permissions."
        />

        <div className="flex-1 space-y-4" data-testid="ask-messages">
          {messages.length === 0 && (
            <div data-testid="ask-empty">
              <Card>
                <EmptyState
                  icon={Bot}
                  title="Ask about your KPIs"
                  description={'For example: "What’s our revenue trend?" Answers cite the KPIs they draw from.'}
                />
                <div
                  className="flex flex-wrap gap-2 border-t border-border px-6 py-4"
                  data-testid="ask-suggestions"
                >
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      disabled={busy}
                      onClick={() => void submitQuestion(prompt)}
                      className="rounded-full border border-border bg-surface-1 px-3 py-1.5 text-xs font-medium text-content-strong transition-colors hover:border-accent-primary hover:text-accent-primary disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              data-testid={m.role === 'assistant' ? 'ask-answer' : 'ask-question'}
              className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
            >
              <div
                className={cn(
                  'max-w-[85%] rounded-xl px-4 py-3 text-sm shadow-xs',
                  m.role === 'user'
                    ? 'bg-accent-primary text-white'
                    : 'border border-border bg-surface-bg text-content-strong',
                )}
              >
                <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                {m.answer && (
                  <>
                    {m.answer.sources.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2" data-testid="ask-sources">
                        {m.answer.sources.map((s) => (
                          <Link key={s.kpiId} href={`/kpis/${s.kpiId}`}>
                            <Badge
                              tone="info"
                              className="transition-colors hover:brightness-95"
                            >
                              {s.name}
                            </Badge>
                          </Link>
                        ))}
                      </div>
                    )}
                    <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-content-muted">
                      <span>{m.answer.provider}</span>
                      <span aria-hidden>·</span>
                      <span className="font-mono">{m.answer.model}</span>
                      <span aria-hidden>·</span>
                      <span className="tabular-nums">${m.answer.costUsd.toFixed(4)}</span>
                    </p>
                  </>
                )}
              </div>
            </div>
          ))}

          {busy && (
            <div className="flex justify-start" data-testid="ask-typing">
              <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-bg px-4 py-3 text-sm text-content-muted shadow-xs">
                <Sparkles aria-hidden className="h-4 w-4 animate-pulse text-accent-primary" />
                Thinking…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {error && (
          <div
            role="alert"
            data-testid="ask-error"
            className="rounded-lg border border-status-critical bg-status-critical-bg px-4 py-3 text-sm font-medium text-status-critical"
          >
            {error}
          </div>
        )}

        <form onSubmit={ask} className="sticky bottom-0 flex gap-2 pb-2">
          <input
            data-testid="ask-input"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about your KPIs…"
            className="h-10 flex-1 rounded-lg border border-border bg-surface-bg px-4 text-sm text-content-strong placeholder:text-content-muted transition-colors focus-visible:border-accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="submit" data-testid="ask-submit" isLoading={busy}>
            Ask
          </Button>
        </form>
      </div>
      </AppShell>
    </RequirePermission>
  );
}
