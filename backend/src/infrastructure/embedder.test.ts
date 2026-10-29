import { expect, test } from "bun:test";
import { chooseEmbedder } from "./embedder";

test("sem chave a busca fica indisponível; hash permite testes sem rede", () => {
  expect(chooseEmbedder({})).toBeNull();
  expect(chooseEmbedder({ EMBEDDING_PROVIDER: "hash", GEMINI_API_KEY: "ignorada" })!.id).toBe("hash-1024");
});

test("limiar do Gemini é configurável e tem padrão calibrado", () => {
  expect(chooseEmbedder({ GEMINI_API_KEY: "k" })!.maxDistance).toBe(0.38);
  expect(chooseEmbedder({ GEMINI_API_KEY: "k", SEMANTIC_MAX_DISTANCE: "0.4" })!.maxDistance).toBe(0.4);
});

test("limiar inválido falha com uma mensagem de configuração", () => {
  for (const value of ["NaN", "Infinity", "-0.1", "2.1"]) {
    expect(() => chooseEmbedder({ GEMINI_API_KEY: "k", SEMANTIC_MAX_DISTANCE: value }))
      .toThrow("SEMANTIC_MAX_DISTANCE");
  }
});
