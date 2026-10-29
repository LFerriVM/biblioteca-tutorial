import type { RedisClient } from "bun";
import { ready, redis, redisKey } from "../../../infrastructure/redis";
import type { BookView } from "../domain/Book";

export type CacheStatus = "HIT" | "MISS" | "BYPASS";
const TTL_SECONDS = 60;
const GENERATION = redisKey("acervo", "listagem", "geracao");
const generationHash = (generation: number) => redisKey("acervo", "listagem", String(generation));

/** O dia civil faz parte do campo: reservas podem expirar sem nenhuma escrita. */
export async function readCachedList(today: string, client: RedisClient | null = redis): Promise<{ generation: number; books: BookView[] | null } | null> {
  if (!client) return null;
  try {
    await ready(client);
    const generation = Number(await client.get(GENERATION) ?? 0);
    const cached = await client.hget(generationHash(generation), today);
    return { generation, books: cached === null ? null : JSON.parse(cached) as BookView[] };
  } catch (error) {
    console.warn("Cache de livros indisponível:", (error as Error).message);
    return null;
  }
}

/** Grava na geração lida antes do Postgres; escritas concorrentes a tornam invisível. */
export async function writeCachedList(today: string, generation: number, books: BookView[], client: RedisClient | null = redis): Promise<void> {
  if (!client) return;
  try {
    await ready(client);
    await client.send("HSETEX", [generationHash(generation), "EX", String(TTL_SECONDS), "FIELDS", "1", today, JSON.stringify(books)]);
  } catch (error) {
    console.warn("Cache de livros indisponível:", (error as Error).message);
  }
}

/** Somente depois do COMMIT: livros, nomes de autores e disponibilidade mudaram. */
export async function invalidateBookList(client: RedisClient | null = redis): Promise<void> {
  if (!client) return;
  try {
    await ready(client);
    await client.incr(GENERATION);
  } catch (error) {
    console.warn("Cache de livros indisponível:", (error as Error).message);
  }
}
