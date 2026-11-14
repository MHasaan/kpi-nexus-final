'use client';

import { useState } from 'react';

import { Button, Select, Tabs, TabsList, TabsTrigger } from '@/components/ui';
import {
  EXPLAIN_FIELDS,
  SUGGEST_FIELDS,
  type SectionGroup,
  acceptedSectionsPatch,
  copilotErrorMessage,
  groupPatchBySection,
  suggestionPatch,
} from '@/lib/copilot';
import {
  type CachedDraft,
  type DraftPayload,
  type GenerateResult,
  aiApply,
  aiAssistant,
  aiExplain,
  aiGenerate,
  aiSuggest,
  patchDraft,
} from '@/lib/onboarding-client';

type Mode = 'generate' | 'assistant' | 'suggest' | 'explain';

type Entry =
  | { id: number; mode: 'generate'; input: string; result: GenerateResult; accepted: Set<string>; done?: string }
  | { id: number; mode: 'assistant'; input: string; groups: SectionGroup[]; ignored: number; accepted: Set<string>; done?: string }
  | { id: number; mode: 'suggest'; input: string; field: string; suggestions: string[]; used: Set<string> }
  | { id: number; mode: 'explain'; input: string; explanation: string };

type NewEntry = Entry extends infer E ? (E extends Entry ? Omit<E, 'id'> : never) : never;

const GENERATED_SECTIONS = ['roles', 'positions', 'orgUnitTypes', 'orgUnits', 'kpiCategories', 'kpis'] as const;

const PLACEHOLDER: Record<Mode, string> = {
  generate: 'e.g. B2B SaaS startup, 50 employees',
  assistant: 'e.g. Add a Head of Design role',
  suggest: 'Optional context, e.g. we sell to hospitals',
  explain: '',
};

const HINT: Record<Mode, string> = {
  generate: 'Describe your organization and let AI draft roles, units, and KPIs. You choose which sections to keep.',
  assistant: 'Ask for a change to the current draft. You review it section by section before anything is saved.',
  suggest: 'Get suggested values for a field. Click a suggestion to add it to the draft.',
  explain: 'Ask what a part of the setup means, with one best practice.',
};

export interface AiCopilotRailProps {
  handle: CachedDraft;
  payload: DraftPayload;
  onDraftChanged: () => Promise<void>;
  onClose: () => void;
}

/** The onboarding AI co-pilot rail: Generate / Assistant / Suggest / Explain. */
export function AiCopilotRail({ handle, payload, onDraftChanged, onClose }: AiCopilotRailProps) {
  const [mode, setMode] = useState<Mode>('generate');
  const [input, setInput] = useState('');
  const [suggestField, setSuggestField] = useState<string>(SUGGEST_FIELDS[0].path);
  const [explainField, setExplainField] = useState<string>(EXPLAIN_FIELDS[0].path);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thread, setThread] = useState<Entry[]>([]);
  const [nextId, setNextId] = useState(1);

  const update = (id: number, fn: (e: Entry) => Entry) => setThread((t) => t.map((e) => (e.id === id ? fn(e) : e)));
  const push = (entry: NewEntry) => {
    setThread((t) => [...t, { ...entry, id: nextId } as Entry]);
    setNextId((n) => n + 1);
  };

  const canSend = !busy && (mode === 'explain' || mode === 'suggest' || input.trim().length > 0);

  const send = async () => {
    if (!canSend) return;
    setError(null);
    setBusy(true);
    const text = input.trim();
    try {
      if (mode === 'generate') {
        const result = await aiGenerate(handle.sessionId, handle.draftToken, text);
        const offered = GENERATED_SECTIONS.filter((s) => (result.counts[s] ?? 0) > 0);
        push({ mode, input: text, result, accepted: new Set(['organization', ...offered]) });
      } else if (mode === 'assistant') {
        const res = await aiAssistant(handle.sessionId, handle.draftToken, text);
        const { sections, ignored } = groupPatchBySection(res.patch);
        push({ mode, input: text, groups: sections, ignored, accepted: new Set(sections.map((g) => g.section)) });
      } else if (mode === 'suggest') {
        const res = await aiSuggest(handle.sessionId, handle.draftToken, suggestField, text || undefined);
        const label = SUGGEST_FIELDS.find((f) => f.path === suggestField)?.label ?? suggestField;
        push({ mode, input: label, field: suggestField, suggestions: res.suggestions, used: new Set() });
      } else {
        const res = await aiExplain(handle.sessionId, handle.draftToken, explainField);
        const label = EXPLAIN_FIELDS.find((f) => f.path === explainField)?.label ?? explainField;
        push({ mode, input: label, explanation: res.explanation });
      }
      if (mode === 'generate' || mode === 'assistant') setInput('');
    } catch (e) {
      setError(copilotErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: number, section: string) =>
    update(id, (e) => {
      if (e.mode !== 'generate' && e.mode !== 'assistant') return e;
      const accepted = new Set(e.accepted);
      if (accepted.has(section)) accepted.delete(section);
      else accepted.add(section);
      return { ...e, accepted };
    });

  const applyGenerated = async (entry: Extract<Entry, { mode: 'generate' }>) => {
    const offered = ['organization', ...GENERATED_SECTIONS.filter((s) => (entry.result.counts[s] ?? 0) > 0)];
    const applied = offered.filter((s) => entry.accepted.has(s));
    const rejected = offered.filter((s) => !entry.accepted.has(s));
    setError(null);
    try {
      await aiApply(handle.sessionId, handle.draftToken, entry.result.interactionId, applied, rejected);
      update(entry.id, (e) => ({ ...e, done: applied.length ? `Applied ${applied.length} section(s)` : 'Dismissed' }));
      await onDraftChanged();
    } catch (e) {
      setError(copilotErrorMessage(e));
    }
  };

  const applyAssistant = async (entry: Extract<Entry, { mode: 'assistant' }>) => {
    setError(null);
    let patch: Partial<DraftPayload>;
    try {
      patch = acceptedSectionsPatch(payload, entry.groups, entry.accepted);
    } catch (e) {
      // A patch that no longer fits the draft (e.g. it changed meanwhile) is refused whole.
      setError(`This change no longer fits the draft: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    try {
      if (Object.keys(patch).length > 0) await patchDraft(handle.sessionId, handle.draftToken, patch, 'ai-assistant');
      update(entry.id, (e) => ({ ...e, done: Object.keys(patch).length ? `Applied ${Object.keys(patch).join(', ')}` : 'Dismissed' }));
      await onDraftChanged();
    } catch (e) {
      setError(copilotErrorMessage(e));
    }
  };

  const useSuggestion = async (entry: Extract<Entry, { mode: 'suggest' }>, value: string) => {
    const patch = suggestionPatch(payload, entry.field, value);
    if (!patch) return;
    setError(null);
    try {
      await patchDraft(handle.sessionId, handle.draftToken, patch, 'ai-suggest');
      update(entry.id, (e) => (e.mode === 'suggest' ? { ...e, used: new Set([...e.used, value]) } : e));
      await onDraftChanged();
    } catch (e) {
      setError(copilotErrorMessage(e));
    }
  };

  return (
    <aside
      data-testid="copilot-rail"
      aria-label="AI co-pilot"
      className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-border bg-surface-1 shadow-xl sm:w-[380px]"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-content-strong">AI co-pilot</h2>
        <button type="button" data-testid="copilot-close" onClick={onClose} aria-label="Close AI co-pilot" className="rounded px-2 py-1 text-content-muted hover:text-content-strong">
          ✕
        </button>
      </div>

      <Tabs value={mode} onValueChange={(v) => { setMode(v as Mode); setError(null); }} className="px-4 pt-2">
        <TabsList>
          {(['generate', 'assistant', 'suggest', 'explain'] as const).map((m) => (
            <TabsTrigger key={m} value={m}>
              <span data-testid={`copilot-tab-${m}`} className="capitalize">{m}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <p className="px-4 pt-2 text-xs text-content-muted">{HINT[mode]}</p>

      <div data-testid="copilot-thread" className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {thread.length === 0 && <p className="text-xs text-content-muted">Nothing here yet.</p>}
        {thread.map((entry) => (
          <div key={entry.id} className="space-y-2">
            <p className="ml-6 rounded-lg bg-surface-bg px-3 py-2 text-xs text-content-strong">
              <span className="font-semibold capitalize">{entry.mode}:</span> {entry.input || '—'}
            </p>

            {entry.mode === 'generate' && (
              <div data-testid="ai-diff" className="rounded border border-border bg-surface-bg p-3 text-xs">
                <p className="text-content-strong">
                  Proposed: {entry.result.counts.roles} roles · {entry.result.counts.orgUnits} units · {entry.result.counts.kpis} KPIs
                </p>
                <ul className="mt-2 space-y-1">
                  {['organization', ...GENERATED_SECTIONS.filter((s) => (entry.result.counts[s] ?? 0) > 0)].map((s) => (
                    <li key={s}>
                      <label className="flex items-center gap-2 text-content-strong">
                        <input type="checkbox" data-testid={`ai-section-${s}`} checked={entry.accepted.has(s)} disabled={!!entry.done} onChange={() => toggle(entry.id, s)} />
                        {s}
                        {s !== 'organization' && <span className="text-content-muted">({entry.result.counts[s as keyof GenerateResult['counts']]})</span>}
                      </label>
                    </li>
                  ))}
                </ul>
                {entry.done ? (
                  <p className="mt-2 text-status-positive">{entry.done}</p>
                ) : (
                  <Button size="sm" className="mt-2" data-testid="ai-apply" onClick={() => void applyGenerated(entry)}>
                    Apply selected
                  </Button>
                )}
              </div>
            )}

            {entry.mode === 'assistant' && (
              <div data-testid="ai-patch-preview" className="rounded border border-border bg-surface-bg p-3 text-xs">
                {entry.groups.length === 0 ? (
                  <p className="text-content-muted">The assistant proposed no usable change. Try rephrasing.</p>
                ) : (
                  <ul className="space-y-1">
                    {entry.groups.map((g) => (
                      <li key={g.section}>
                        <label className="flex items-center gap-2 text-content-strong">
                          <input type="checkbox" data-testid={`ai-patch-section-${g.section}`} checked={entry.accepted.has(g.section)} disabled={!!entry.done} onChange={() => toggle(entry.id, g.section)} />
                          {g.section}
                          <span className="text-content-muted">
                            {[g.summary.add && `+${g.summary.add} added`, g.summary.replace && `${g.summary.replace} changed`, g.summary.remove && `−${g.summary.remove} removed`].filter(Boolean).join(' · ')}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
                {entry.ignored > 0 && <p className="mt-1 text-content-muted">{entry.ignored} unusable change(s) ignored.</p>}
                {entry.done ? (
                  <p className="mt-2 text-status-positive">{entry.done}</p>
                ) : (
                  entry.groups.length > 0 && (
                    <Button size="sm" className="mt-2" data-testid="ai-patch-apply" onClick={() => void applyAssistant(entry)}>
                      Apply accepted
                    </Button>
                  )
                )}
              </div>
            )}

            {entry.mode === 'suggest' && (
              <div className="flex flex-wrap gap-2" data-testid="ai-suggestions">
                {entry.suggestions.length === 0 && <p className="text-xs text-content-muted">No suggestions this time.</p>}
                {entry.suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    data-testid="ai-suggestion-chip"
                    disabled={entry.used.has(s)}
                    onClick={() => void useSuggestion(entry, s)}
                    className="rounded-full border border-border bg-surface-bg px-3 py-1 text-xs text-content-strong hover:border-accent-primary disabled:opacity-60"
                  >
                    {entry.used.has(s) ? `✓ ${s}` : s}
                  </button>
                ))}
              </div>
            )}

            {entry.mode === 'explain' && (
              <p data-testid="ai-explanation" className="whitespace-pre-line rounded border border-border bg-surface-bg p-3 text-xs text-content-strong">
                {entry.explanation}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="space-y-2 border-t border-border px-4 py-3">
        {error && <p className="text-xs text-status-critical" data-testid="copilot-error" role="alert">{error}</p>}
        {mode === 'suggest' && (
          <Select data-testid="ai-suggest-field" value={suggestField} onChange={(e) => setSuggestField(e.target.value)} aria-label="Field to suggest values for">
            {SUGGEST_FIELDS.map((f) => <option key={f.path} value={f.path}>{f.label}</option>)}
          </Select>
        )}
        {mode === 'explain' && (
          <Select data-testid="ai-explain-field" value={explainField} onChange={(e) => setExplainField(e.target.value)} aria-label="Field to explain">
            {EXPLAIN_FIELDS.map((f) => <option key={f.path} value={f.path}>{f.label}</option>)}
          </Select>
        )}
        <div className="flex gap-2">
          {mode !== 'explain' && (
            <input
              data-testid="ai-prompt"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void send(); }}
              placeholder={PLACEHOLDER[mode]}
              aria-label="Message to the AI co-pilot"
              className="min-w-0 flex-1 rounded border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong"
            />
          )}
          <Button data-testid={mode === 'generate' ? 'ai-generate' : 'ai-send'} onClick={() => void send()} disabled={!canSend} isLoading={busy} className={mode === 'explain' ? 'w-full' : ''}>
            {mode === 'generate' ? 'Generate' : mode === 'explain' ? 'Explain' : mode === 'suggest' ? 'Suggest' : 'Send'}
          </Button>
        </div>
      </div>
    </aside>
  );
}
