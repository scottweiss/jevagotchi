/**
 * The one place that talks to Jev.
 *
 * This lives server-side because it has to: the SDK sets `dangerouslyAllowBrowser`
 * to false and throws when constructed in a browser. That is not a policy we chose,
 * it is the shape of the dependency — so the web app never sees the API key.
 */
import { TypeSafeClient, type Questions } from "@typesafe-ai/sdk";
import { QUESTIONS, type PsycheState } from "@jevagotchi/core";

export interface ThinkResult {
  answers: Record<string, unknown>;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
  latencyMs: number;
}

export function createThinker(client = new TypeSafeClient({ timeout: 15_000 })) {
  return async function think(state: PsycheState): Promise<ThinkResult> {
    const started = performance.now();
    const result = await client.systemOne({
      state,
      // core declares the questions as plain data; the shapes are structurally
      // identical to the SDK's, which is why core needs no dependency on it.
      questions: QUESTIONS as unknown as Questions,
    });
    return {
      answers: result.answers as Record<string, unknown>,
      model: result.model,
      usage: result.usage,
      latencyMs: Math.round(performance.now() - started),
    };
  };
}
