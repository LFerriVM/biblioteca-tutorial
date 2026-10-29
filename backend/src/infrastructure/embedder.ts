import type { Embedder } from "../shared/Embedder";
import { createGeminiEmbedder } from "./gemini";
import { createHashEmbedder } from "./hashEmbedder";

/**
 * Escolhe o embedder pelo ambiente. A suíte de testes usa EMBEDDING_PROVIDER=hash;
 * a aplicação usa o Gemini quando há chave. Sem chave, null: as escritas seguem
 * normalmente, sem indexar, e a busca semântica responde 503.
 */
export function chooseEmbedder(env: Record<string, string | undefined>): Embedder | null {
  if (env.EMBEDDING_PROVIDER === "hash") return createHashEmbedder();
  if (env.GEMINI_API_KEY) {
    const maxDistance = Number(env.SEMANTIC_MAX_DISTANCE ?? 0.38);
    if (!Number.isFinite(maxDistance) || maxDistance < 0 || maxDistance > 2) {
      throw new Error("SEMANTIC_MAX_DISTANCE deve estar entre 0 e 2");
    }
    return createGeminiEmbedder(env.GEMINI_API_KEY, { maxDistance });
  }
  return null;
}

export const embedder: Embedder | null = chooseEmbedder(process.env);
