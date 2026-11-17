import { z } from 'zod';

import {
  DynamicStddevConfigSchema,
  RateOfChangeConfigSchema,
  StaticThresholdConfigSchema,
} from '../../alert-rules/dto/alert-rule.dto.js';
import { evaluateComposite } from './composite.js';
import { evaluateDynamicStddev } from './dynamic-stddev.js';
import { evaluateRateOfChange } from './rate-of-change.js';
import { evaluateStaticThreshold } from './static-threshold.js';
import { type EvaluationResult, notTriggered } from './types.js';

/**
 * A stored composite, read leniently: the join and a list of parts, each
 * part's own config checked when that part is judged. Rules saved before the
 * parts were typed must still work part by part — one unreadable part must not
 * silence an OR whose other part holds.
 */
const StoredCompositeSchema = z.object({
  operator: z.enum(['AND', 'OR']),
  rules: z.array(z.object({ ruleType: z.string(), config: z.unknown() })).min(1),
});

/** What a rule is judged against when a value is recorded. Gathered once per KPI. */
export interface RuleInputs {
  /** The value just recorded. */
  value: number;
  /** Earlier values of the same series, newest first. */
  history: readonly number[];
  /** For each `windowMinutes` in use: the value the KPI had that long ago, or null. */
  baselines: ReadonlyMap<number, number | null>;
}

/** What the rules on a KPI need loaded before they can be judged. */
export interface RuleNeeds {
  /** How many earlier values the widest std-dev rule looks at (0: none). */
  historySize: number;
  /** Every rate-of-change window in use. */
  windows: Set<number>;
}

/**
 * Judge one rule of any data-point-triggered type. Stored configs are parsed
 * again here: a rule saved before its type was checked (or a composite part,
 * which older versions took as any JSON) must not throw — it simply does not
 * trigger. NO_DATA is absent on purpose: it is judged by the clock, not by a
 * value arriving, and inside a composite it can never hold at that moment.
 */
export function evaluateRule(ruleType: string, config: unknown, inputs: RuleInputs): EvaluationResult {
  switch (ruleType) {
    case 'STATIC_THRESHOLD': {
      const parsed = StaticThresholdConfigSchema.safeParse(config);
      return parsed.success ? evaluateStaticThreshold(parsed.data, inputs.value) : notTriggered;
    }
    case 'DYNAMIC_STDDEV': {
      const parsed = DynamicStddevConfigSchema.safeParse(config);
      return parsed.success ? evaluateDynamicStddev(parsed.data, inputs.value, inputs.history) : notTriggered;
    }
    case 'RATE_OF_CHANGE': {
      const parsed = RateOfChangeConfigSchema.safeParse(config);
      return parsed.success
        ? evaluateRateOfChange(parsed.data, inputs.value, inputs.baselines.get(parsed.data.windowMinutes) ?? null)
        : notTriggered;
    }
    case 'COMPOSITE': {
      const parsed = StoredCompositeSchema.safeParse(config);
      return parsed.success ? evaluateComposite(parsed.data, (part) => evaluateRule(part.ruleType, part.config, inputs)) : notTriggered;
    }
    default:
      return notTriggered;
  }
}

/** Work out what must be loaded for a KPI's rules, composite parts included. */
export function ruleNeeds(rules: ReadonlyArray<{ ruleType: string; config: unknown }>): RuleNeeds {
  const needs: RuleNeeds = { historySize: 0, windows: new Set() };
  const visit = (ruleType: string, config: unknown): void => {
    if (ruleType === 'DYNAMIC_STDDEV') {
      const parsed = DynamicStddevConfigSchema.safeParse(config);
      if (parsed.success) needs.historySize = Math.max(needs.historySize, parsed.data.windowSize);
    } else if (ruleType === 'RATE_OF_CHANGE') {
      const parsed = RateOfChangeConfigSchema.safeParse(config);
      if (parsed.success) needs.windows.add(parsed.data.windowMinutes);
    } else if (ruleType === 'COMPOSITE') {
      const parsed = StoredCompositeSchema.safeParse(config);
      if (parsed.success) for (const part of parsed.data.rules) visit(part.ruleType, part.config);
    }
  };
  for (const rule of rules) visit(rule.ruleType, rule.config);
  return needs;
}
