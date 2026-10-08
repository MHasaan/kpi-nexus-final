'use client';

import Link from 'next/link';
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, Check, Copy, Sparkles, Trash2 } from 'lucide-react';

import { ApiError, type NlqAnswer, askNlq, getAccessToken } from '../../lib/api-client';
import { AppShell } from '../../components/app-shell';
import { RequirePermission } from '../../components/auth/require-permission';
import { PageHeader, Card, Button, Badge, EmptyState } from '../../components/ui';
import { cn } from '../../lib/cn';
import { currentLoginRedirect } from '../../lib/auth-redirect';

// Static starter prompts shown in the empty state — clicking one submits it.
const SUGGESTED_PROMPTS = [
  'Which KPIs are off track this quarter?',
  'Forecast MRR for next 3 months',
  'Compare CAC across org units',
];

// Smart follow-up chips offered after every answer.
const FOLLOW_UP_PROMPTS = [
  'Which KPIs are off target?',
  "Summarize this month's performance",
  "What's trending down?",
  'Where should I focus next?',
];

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  answer?: NlqAnswer;
}

/**
 * Minimal, XSS-safe markdown renderer. We intentionally avoid a markdown
 * library (and `dangerouslySetInnerHTML`) — the answer text comes from an LLM
 * and is untrusted. This handles the common shapes an answer takes: paragraphs,
 * `- ` / `* ` bullet lists, `1.` ordered lists, and inline `**bold**`. Anything
 * it doesn't recognise falls through as plain text, so it can never inject HTML.
 */
function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Split on **bold** while keeping the delimiters' content.
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  parts.forEach((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      nodes.push(
        <strong key={i} className="font-semibold text-content-strong">
          {part.slice(2, -2)}
        </strong>,
      );
    } else if (part) {
      nodes.push(<span key={i}>{part}</span>);
    }
  });
  return nodes;
}

interface Block {
  type: 'p' | 'ul' | 'ol';
  lines: string[];
}

function toBlocks(answer: string): Block[] {
  const blocks: Block[] = [];
  const rawLines = answer.replace(/\r\n/g, '\n').split('\n');
  for (const raw of rawLines) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet) {
      const last = blocks[blocks.length - 1];
      if (last && last.type === 'ul') last.lines.push(bullet[1]!);
      else blocks.push({ type: 'ul', lines: [bullet[1]!] });
    } else if (ordered) {
      const last = blocks[blocks.length - 1];
      if (last && last.type === 'ol') last.lines.push(ordered[1]!);
      else blocks.push({ type: 'ol', lines: [ordered[1]!] });
    } else if (line.trim() === '') {
      // Blank line ends the current block.
      if (blocks.length && blocks[blocks.length - 1]!.type === 'p') {
        // Start a fresh paragraph on the next non-empty line.
        blocks.push({ type: 'p', lines: [] });
      }
    } else {
      const last = blocks[blocks.length - 1];
      if (last && last.type === 'p') last.lines.push(line);
      else blocks.push({ type: 'p', lines: [line] });
    }
  }
  return blocks.filter((b) => b.lines.length > 0);
}

function Markdown({ children }: { children: string }) {
  const blocks = toBlocks(children);
  return (
    <div className="space-y-2 leading-relaxed">
      {blocks.map((block, i) => {
        if (block.type === 'ul') {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {block.lines.map((l, j) => (
                <li key={j}>{renderInline(l)}</li>
              ))}
            </ul>
          );
        }
        if (block.type === 'ol') {
          return (
            <ol key={i} className="list-decimal space-y-1 pl-5">
              {block.lines.map((l, j) => (
                <li key={j}>{renderInline(l)}</li>
              ))}
            </ol>
          );
        }
        return <p key={i}>{renderInline(block.lines.join(' '))}</p>;
      })}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — fail silently.
    }
  };

  return (
    <button
      type="button"
      data-testid="ask-copy"
      onClick={() => void copy()}
      aria-label={copied ? 'Copied to clipboard' : 'Copy answer'}
      className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-1 px-2 py-1 text-xs font-medium text-content-muted transition-colors hover:border-accent-primary hover:text-accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {copied ? <Check aria-hidden className="h-3.5 w-3.5" /> : <Copy aria-hidden className="h-3.5 w-3.5" />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

export default function AskPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!getAccessToken()) router.replace(currentLoginRedirect());
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
      const res = await askNlq(q);
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

  const clearConversation = () => {
    setMessages([]);
    setError(null);
    setQuestion('');
  };

  // Follow-ups appear only after the most recent assistant answer.
  const lastIsAnswer = messages.length > 0 && messages[messages.length - 1]!.role === 'assistant';

  return (
    <RequirePermission permission="ANALYTICS_VIEW">
      <AppShell>
        <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-5">
          <PageHeader
            eyebrow="Intelligence"
            title="Ask"
            subtitle="Ask questions in plain language — answers are grounded in your visible data and respect your permissions."
            actions={
              messages.length > 0 ? (
                <Button
                  variant="secondary"
                  size="sm"
                  data-testid="ask-clear"
                  onClick={clearConversation}
                  leftIcon={<Trash2 aria-hidden className="h-4 w-4" />}
                >
                  New chat
                </Button>
              ) : undefined
            }
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
                    {SUGGESTED_PROMPTS.map((prompt, i) => (
                      <button
                        key={prompt}
                        type="button"
                        disabled={busy}
                        data-testid={`ask-suggestion-${i}`}
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
                  {m.role === 'assistant' ? (
                    <Markdown>{m.text}</Markdown>
                  ) : (
                    <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                  )}
                  {m.answer && (
                    <>
                      {m.answer.sources.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2" data-testid="ask-sources">
                          {m.answer.sources.map((s) => (
                            <Link
                              key={s.kpiId}
                              href={`/kpis/${s.kpiId}`}
                              data-testid={`ask-source-${s.kpiId}`}
                            >
                              <Badge tone="info" className="transition-colors hover:brightness-95">
                                {s.name}
                              </Badge>
                            </Link>
                          ))}
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
                        <p className="flex flex-wrap items-center gap-x-2 text-xs text-content-muted">
                          <span>{m.answer.provider}</span>
                          <span aria-hidden>·</span>
                          <span className="font-mono">{m.answer.model}</span>
                          <span aria-hidden>·</span>
                          <span className="tabular-nums">${m.answer.costUsd.toFixed(4)}</span>
                        </p>
                        <CopyButton text={m.text} />
                      </div>
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

            {lastIsAnswer && !busy && (
              <div className="flex flex-wrap gap-2 pt-1" data-testid="ask-followups">
                {FOLLOW_UP_PROMPTS.map((prompt, i) => (
                  <button
                    key={prompt}
                    type="button"
                    data-testid={`ask-suggestion-${i}`}
                    onClick={() => void submitQuestion(prompt)}
                    className="rounded-full border border-border bg-surface-1 px-3 py-1.5 text-xs font-medium text-content-muted transition-colors hover:border-accent-primary hover:text-accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {prompt}
                  </button>
                ))}
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
            <label htmlFor="ask-input" className="sr-only">
              Ask a question about your KPIs
            </label>
            <input
              id="ask-input"
              data-testid="ask-input"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask about your KPIs…"
              className="h-10 flex-1 rounded-lg border border-border bg-surface-bg px-4 text-sm text-content-strong placeholder:text-content-muted transition-colors focus-visible:border-accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button type="submit" data-testid="ask-send" isLoading={busy}>
              Ask
            </Button>
          </form>
        </div>
      </AppShell>
    </RequirePermission>
  );
}
