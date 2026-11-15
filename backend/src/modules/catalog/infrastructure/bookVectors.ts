import { inTransaction } from "../../../infrastructure/transaction";

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
