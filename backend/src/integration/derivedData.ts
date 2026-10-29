import type { RedisClient } from "bun";
import { redis } from "../infrastructure/redis";
import { invalidateAuthorSearch } from "../modules/authorship";
import { invalidateBookList, reconcileBookIndex } from "../modules/catalog";
import { catalogIntegration } from "./catalogIntegration";

/**
 * Os dados derivados do Redis podem ter ficado para trás: o servidor esteve
 * parado enquanto o banco mudou, ou o seed escreveu direto nas tabelas.
 * Recalcula tudo a partir do Postgres, a fonte da verdade.
 */
export async function refreshDerivedData(): Promise<void> {
  await invalidateAuthorSearch();
  await invalidateBookList();
  const { indexed, removed } = await reconcileBookIndex(catalogIntegration);
  console.log(`Índice semântico: ${indexed} livro(s) indexado(s), ${removed} removido(s)`);
}

/**
 * Enquanto o Redis esteve fora, as escritas no Postgres continuaram, mas não
 * conseguiram invalidar o cache nem indexar livros. Por isso cada conexão (a
 * primeira e cada reconexão automática) recalcula os dados derivados.
 */
export function refreshDerivedDataOnConnect(client: RedisClient | null = redis, refresh = refreshDerivedData): void {
  if (!client) return;
  // Uma reconexão durante o recálculo agenda outra passagem, sem sobrepor snapshots.
  let running = false;
  let pending = false;
  async function drain(): Promise<void> {
    if (running) return;
    running = true;
    try {
      while (pending) {
        pending = false;
        try { await refresh(); }
        catch (error) { console.warn("Falha ao recalcular dados derivados:", error); }
      }
    } finally { running = false; }
  }
  client.onconnect = () => { pending = true; void drain(); };
}
