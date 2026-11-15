import { sql } from "../../../infrastructure/postgres";
import { inTransaction } from "../../../infrastructure/transaction";
import type { Embedder } from "../../../shared/Embedder";

/**
 * Vetores dos livros no PostgreSQL, com a extensão pgvector. Uma linha por livro,
 * com o texto indexado, o id do modelo que gerou o vetor e o vetor em si. A chave
 * estrangeira com ON DELETE CASCADE apaga o vetor junto com o livro. Tudo aqui é
 * derivado de `livros` e dos autores: pode ser apagado e reconstruído.
 */

/** CREATE EXTENSION não aceita parâmetros e é idempotente; o lock evita corrida entre processos. */
export async function ensureVectorExtension(): Promise<void> {
  await inTransaction(async (tx) => {
    await tx`CREATE EXTENSION IF NOT EXISTS vector`;
  });
}

/** A dimensão da coluna que existe hoje, ou null se a tabela ainda não existe. */
async function currentDimensions(db: typeof sql): Promise<number | null> {
  const [row] = await db`
    SELECT atttypmod AS dims FROM pg_attribute
    WHERE attrelid = to_regclass('livros_vetores') AND attname = 'embedding'
  ` as { dims: number }[];
  return row ? row.dims : null;
}

/**
 * Garante que a tabela existe para este embedder e diz se precisou (re)criá-la.
 * Vetores de outro modelo não se comparam com os deste: trocar de modelo, ou de
 * dimensão, apaga a tabela e começa de novo.
 */
export async function ensureBookVectors(embedder: Embedder): Promise<boolean> {
  const dimensions = embedder.dimensions;
  // 2000 é o limite do índice HNSW para vector; o número vai cru para o DDL, então precisa ser validado
  if (!Number.isInteger(dimensions) || dimensions < 1 || dimensions > 2000) {
    throw new Error(`Dimensão inválida: ${dimensions}`);
  }
  const upToDate = async (db: typeof sql) => {
    if (await currentDimensions(db) !== dimensions) return false;
    const [other] = await db`SELECT 1 AS found FROM livros_vetores WHERE modelo <> ${embedder.id} LIMIT 1`;
    return !other;
  };
  if (await upToDate(sql)) return false;

  return await inTransaction(async (tx) => {
    // outra requisição pode ter recriado a tabela enquanto esperávamos o lock
    if (await upToDate(tx as unknown as typeof sql)) return false;
    await tx`DROP TABLE IF EXISTS livros_vetores`;
    await tx.unsafe(`
      CREATE TABLE livros_vetores (
        livro_id INTEGER PRIMARY KEY REFERENCES livros(id) ON DELETE CASCADE,
        modelo TEXT NOT NULL,
        texto TEXT NOT NULL,
        embedding vector(${dimensions}) NOT NULL
      )`);
    await tx`CREATE INDEX livros_vetores_embedding_idx ON livros_vetores USING hnsw (embedding vector_cosine_ops)`;
    return true;
  });
}
