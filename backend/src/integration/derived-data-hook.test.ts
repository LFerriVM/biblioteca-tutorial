import { expect, spyOn, test } from "bun:test";
import type { RedisClient } from "bun";
import { refreshDerivedDataOnConnect } from "./derivedData";

test("reconexão durante o recálculo agenda uma nova passagem sem sobreposição", async () => {
  const client = { onconnect: null } as unknown as RedisClient;
  const gate = Promise.withResolvers<void>();
  const done = Promise.withResolvers<void>();
  let calls = 0;
  let active = 0;
  let maximum = 0;
  refreshDerivedDataOnConnect(client, async () => {
    calls++;
    maximum = Math.max(maximum, ++active);
    if (calls === 1) await gate.promise;
    active--;
    if (calls === 2) done.resolve();
  });
  client.onconnect!();
  client.onconnect!();
  expect(calls).toBe(1);
  gate.resolve();
  await done.promise;
  expect(calls).toBe(2);
  expect(maximum).toBe(1);
});

test("falha no recálculo é registrada e a próxima conexão tenta novamente", async () => {
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  try {
    const client = { onconnect: null } as unknown as RedisClient;
    let calls = 0;
    refreshDerivedDataOnConnect(client, async () => { calls++; throw new Error("falha temporária"); });
    client.onconnect!();
    await Bun.sleep(0);
    client.onconnect!();
    await Bun.sleep(0);
    expect(calls).toBe(2);
    expect(warn).toHaveBeenCalledTimes(2);
  } finally { warn.mockRestore(); }
});
