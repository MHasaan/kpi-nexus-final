/**
 * What each AI feature is called on screen, and what it does. The API and the
 * database know a feature by its key ("NLQ_PRIMARY"); an administrator choosing
 * a model for it needs to know which part of the product they are changing.
 */
export interface AiFeatureInfo {
  name: string;
  /** One line on what the feature does; empty for a feature this page does not know. */
  does: string;
}

const INFO: Record<string, AiFeatureInfo> = {
  ONBOARDING_GENERATOR: { name: 'Setup wizard: first draft', does: 'Drafts your structure and KPIs from your description.' },
  ONBOARDING_ASSISTANT: { name: 'Setup wizard: assistant', does: "Answers questions in the wizard's side panel." },
  ONBOARDING_SUGGEST: { name: 'Setup wizard: suggestions', does: 'Suggests entries for the step you are on.' },
  ONBOARDING_EXPLAIN: { name: 'Setup wizard: explanations', does: 'Explains a step or a field in the wizard.' },
  KPI_SUGGESTIONS: { name: 'KPI suggestions', does: 'Suggests KPIs you could add.' },
  NLQ_PRIMARY: { name: 'Ask', does: 'Answers questions on the Ask page.' },
  NLQ_TOOLS: { name: 'Ask: data lookups', does: 'Reserved for the lookups Ask makes while answering.' },
  INSIGHTS: { name: 'Insights', does: 'Writes the findings on the Insights page.' },
  RECOMMENDATIONS: { name: 'Recommendations', does: 'Writes the suggested actions on the Recommendations page.' },
  ANOMALY_EXPLANATIONS: { name: 'Unusual value explanations', does: 'Reserved for explaining a value that is out of pattern.' },
  EMBEDDINGS: { name: 'KPI matching for Ask', does: 'Finds which KPIs a question is about.' },
};

export function aiFeatureInfo(feature: string): AiFeatureInfo {
  const known = INFO[feature];
  if (known) return known;
  const words = feature.toLowerCase().replace(/_/g, ' ');
  return { name: words.charAt(0).toUpperCase() + words.slice(1), does: '' };
}
