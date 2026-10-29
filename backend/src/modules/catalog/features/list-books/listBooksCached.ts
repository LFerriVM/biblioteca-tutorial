import type { RedisClient } from "bun";
import { redis } from "../../../../infrastructure/redis";
import { civilDate } from "../../../../shared/dates";
import type { BookView } from "../../domain/Book";
import type { CatalogIntegration } from "../../domain/CatalogIntegration";
import { readCachedList, writeCachedList, type CacheStatus } from "../../infrastructure/listCache";
import { listBooks } from "./listBooks";

/** Cache-aside, como na busca de autores; Postgres continua sendo a fonte da verdade. */
export async function listBooksCached(
  integration: CatalogIntegration,
  client: RedisClient | null = redis,
  now = new Date(),
): Promise<{ books: BookView[]; cache: CacheStatus }> {
  const today = civilDate(now);
  const cached = await readCachedList(today, client);
  if (cached?.books) return { books: cached.books, cache: "HIT" };
  const books = await listBooks(integration, now);
  if (!cached) return { books, cache: "BYPASS" };
  await writeCachedList(today, cached.generation, books, client);
  return { books, cache: "MISS" };
}
