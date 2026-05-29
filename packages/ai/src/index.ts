// Multi-provider AI abstraction (Gemini default + Claude/OpenAI/Ollama fallback).
// See docs/superpowers/plans/P5-ai-layer.md.

export * from './types.js';
export * from './pricing.js';
export { ClaudeProvider, type ClaudeProviderOptions } from './providers/claude.js';
export { GeminiProvider, type GeminiProviderOptions } from './providers/gemini.js';
export { OpenAiProvider, type OpenAiProviderOptions } from './providers/openai.js';
export { OllamaProvider, type OllamaProviderOptions } from './providers/ollama.js';
export { MockProvider, type MockProviderOptions } from './providers/mock.js';
export { type FetchImpl } from './providers/http.js';
