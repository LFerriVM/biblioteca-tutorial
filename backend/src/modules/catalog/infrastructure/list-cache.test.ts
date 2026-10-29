import { expect, spyOn, test } from "bun:test";
import type { RedisClient } from "bun";
import { invalidateBookList, readCachedList, writeCachedList } from "./listCache";

/** Redis em memória com TTL por campo, suficiente para exercitar o protocolo do cache. */
function cacheClient() {
  let generation: string | null = null;
  let now = 0;
  const hashes = new Map<string, Map<string, { value: string; expires: number }>>();
  const client = {
    connected: true,
    async get() { return generation; },
    async incr() { generation = String(Number(generation ?? 0) + 1); },
    async hget(key: string, field: string) {
      const entry = hashes.get(key)?.get(field);
      return entry && entry.expires > now ? entry.value : null;
    },
    async send(command: string, args: string[]) {
      expect(command).toBe("HSETEX");
      const [key, ex, ttl, fields, count, field, value] = args;
      expect([ex, fields, count]).toEqual(["EX", "FIELDS", "1"]);
      if (!hashes.has(key!)) hashes.set(key!, new Map());
      hashes.get(key!)!.set(field!, { value: value!, expires: now + Number(ttl) * 1000 });
    },
  } as unknown as RedisClient;
  return { client, advance(ms: number) { now += ms; } };
}

test("list-books: lista vazia é cacheada por 60 segundos e separada por dia civil", async () => {
  const { client, advance } = cacheClient();
  const cold = await readCachedList("2026-10-29", client);
  expect(cold).toEqual({ generation: 0, books: null });
  await writeCachedList("2026-10-29", cold!.generation, [], client);
  expect((await readCachedList("2026-10-29", client))!.books).toEqual([]);
  expect((await readCachedList("2026-10-30", client))!.books).toBeNull();
  advance(59_999);
  expect((await readCachedList("2026-10-29", client))!.books).toEqual([]);
  advance(1);
  expect((await readCachedList("2026-10-29", client))!.books).toBeNull();
});

test("list-books: uma gravação concorrente na geração antiga não repovoa o cache atual", async () => {
  const { client } = cacheClient();
  const cold = await readCachedList("2026-10-29", client);
  await invalidateBookList(client);
  await writeCachedList("2026-10-29", cold!.generation, [], client);
  expect(await readCachedList("2026-10-29", client)).toEqual({ generation: 1, books: null });
});

test("list-books: ausência, falhas e JSON corrompido no Redis permitem bypass", async () => {
  expect(await readCachedList("2026-10-29", null)).toBeNull();
  await writeCachedList("2026-10-29", 0, [], null);
  await invalidateBookList(null);
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  try {
    const dead = { connected: true, async get() { throw new Error("offline"); }, async send() { throw new Error("offline"); }, async incr() { throw new Error("offline"); } } as unknown as RedisClient;
    expect(await readCachedList("2026-10-29", dead)).toBeNull();
    await writeCachedList("2026-10-29", 0, [], dead);
    await invalidateBookList(dead);
    const broken = { connected: true, async get() { return "0"; }, async hget() { return "invalid json"; } } as unknown as RedisClient;
    expect(await readCachedList("2026-10-29", broken)).toBeNull();
  } finally { warn.mockRestore(); }
});
