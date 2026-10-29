import { expect, test } from "bun:test";
import { api, testAuthor, testBook, testIsbn, testName } from "#tests/api";
import { testReader } from "#tests/reader-fixtures";
import { createRedis } from "../../../../infrastructure/redis";
import { catalogIntegration } from "../../../../integration/catalogIntegration";
import { invalidateBookList } from "../../infrastructure/listCache";
import { listBooks } from "./listBooks";
import { listBooksCached } from "./listBooksCached";

async function list(path = "/livros") {
  const response = await api("GET", path);
  expect(response.status).toBe(200);
  return { cache: response.headers.get("X-Cache"), books: await response.json() as { id: number; titulo: string; autor: string; livrosDoAutor: number; totalExemplares: number; exemplaresDisponiveis: number }[] };
}

test("list-books: MISS/HIT, contrato da busca vazia e ordenação por título e id", async () => {
  const author = await testAuthor();
  const title = testName("Listagem");
  const a = await (await api("POST", "/livros", { isbn: testIsbn(), titulo: title, autorId: author.id })).json();
  const b = await (await api("POST", "/livros", { isbn: testIsbn(), titulo: title, autorId: (await testAuthor()).id })).json();
  await invalidateBookList();
  const first = await list();
  expect(first.cache).toBe("MISS");
  const second = await list();
  expect(second.cache).toBe("HIT");
  expect(second.books).toEqual(first.books);
  expect(first.books.filter(book => book.titulo === title).map(book => book.id)).toEqual([a.id, b.id]);
  expect(first.books).toEqual((await listBooks(catalogIntegration)).map(book => ({
    id: book.id, isbn: book.isbn, titulo: book.title, autorId: book.authorId, autor: book.authorName,
    dataCatalogacao: book.catalogedOn, livrosDoAutor: book.authorBookCount,
    totalExemplares: book.totalCopies, exemplaresDisponiveis: book.availableCopies,
  })));
  expect((await list("/livros?q=%20")).cache).toBe("HIT");
  expect((await list(`/livros?q=${a.isbn}`)).books.map(book => book.id)).toEqual([a.id]);
  expect((await (await api("GET", `/livros/${a.isbn}`)).json())[0].id).toBe(a.id);
  expect((await api("GET", `/livros/id/${a.id}`)).status).toBe(200);
});

test("list-books: criar, editar, transferir e excluir livro invalidam a lista e as contagens", async () => {
  const book = await testBook();
  await list();
  expect((await list()).cache).toBe("HIT");
  const sibling = await (await api("POST", "/livros", { isbn: testIsbn(), titulo: testName("Irmão"), autorId: book.autorId })).json();
  const created = await list();
  expect(created.cache).toBe("MISS");
  expect(created.books.find(b => b.id === book.id)!.livrosDoAutor).toBe(2);
  const next = await testAuthor();
  const title = testName("Renomeado");
  expect((await api("PUT", `/livros/${sibling.id}`, { isbn: sibling.isbn, titulo: title, autorId: next.id })).status).toBe(200);
  const updated = await list();
  expect(updated.cache).toBe("MISS");
  expect(updated.books.find(b => b.id === sibling.id)).toMatchObject({ titulo: title, autor: next.nome, livrosDoAutor: 1 });
  expect(updated.books.find(b => b.id === book.id)!.livrosDoAutor).toBe(1);
  expect((await api("DELETE", `/livros/${sibling.id}`)).status).toBe(204);
  const deleted = await list();
  expect(deleted.cache).toBe("MISS");
  expect(deleted.books.some(b => b.id === sibling.id)).toBe(false);
});

test("list-books: renomear autor e criar/excluir exemplar invalidam a lista", async () => {
  const book = await testBook();
  await list();
  const name = testName("Novo autor");
  expect((await api("PUT", `/autores/${book.autorId}`, { nome: name, tipo: "literatura" })).status).toBe(200);
  const renamed = await list();
  expect(renamed.cache).toBe("MISS");
  expect(renamed.books.find(b => b.id === book.id)!.autor).toBe(name);
  const copy = await (await api("POST", "/exemplares", { livroId: book.id, localizacao: "Estante", estadoConservacao: "bom" })).json();
  const created = await list();
  expect(created.cache).toBe("MISS");
  expect(created.books.find(b => b.id === book.id)).toMatchObject({ totalExemplares: 1, exemplaresDisponiveis: 1 });
  expect((await api("DELETE", `/exemplares/${copy.id}`)).status).toBe(204);
  const deleted = await list();
  expect(deleted.cache).toBe("MISS");
  expect(deleted.books.find(b => b.id === book.id)).toMatchObject({ totalExemplares: 0, exemplaresDisponiveis: 0 });
});

test("list-books: reservar, cancelar, emprestar e devolver atualizam disponibilidade", async () => {
  const book = await testBook();
  const copy = await (await api("POST", "/exemplares", { livroId: book.id, localizacao: "Estante", estadoConservacao: "bom" })).json();
  const reader = await testReader();
  await list();
  const reserved = await api("POST", "/reservas", { leitorId: reader.id, exemplarId: copy.id });
  expect(reserved.status).toBe(201);
  const reservation = await reserved.json();
  const afterReserve = await list();
  expect(afterReserve.cache).toBe("MISS");
  expect(afterReserve.books.find(b => b.id === book.id)!.exemplaresDisponiveis).toBe(0);
  expect((await api("POST", `/reservas/${reservation.id}/cancelamento`)).status).toBe(200);
  const afterCancel = await list();
  expect(afterCancel.cache).toBe("MISS");
  expect(afterCancel.books.find(b => b.id === book.id)!.exemplaresDisponiveis).toBe(1);
  const loaned = await api("POST", "/emprestimos", { leitorId: reader.id, exemplarId: copy.id });
  expect(loaned.status).toBe(201);
  const loan = await loaned.json();
  const afterLoan = await list();
  expect(afterLoan.cache).toBe("MISS");
  expect(afterLoan.books.find(b => b.id === book.id)!.exemplaresDisponiveis).toBe(0);
  expect((await api("POST", `/emprestimos/${loan.id}/devolucao`)).status).toBe(200);
  const afterReturn = await list();
  expect(afterReturn.cache).toBe("MISS");
  expect(afterReturn.books.find(b => b.id === book.id)!.exemplaresDisponiveis).toBe(1);
});

test("list-books: sem Redis ou com Redis indisponível, responde do Postgres", async () => {
  const book = await testBook();
  for (const client of [null, createRedis("redis://127.0.0.1:1", { autoReconnect: false })]) {
    try {
      const result = await listBooksCached(catalogIntegration, client);
      expect(result.cache).toBe("BYPASS");
      expect(result.books.some(b => b.id === book.id)).toBe(true);
    } finally { client?.close(); }
  }
});

test("list-books: escrita rejeitada preserva a geração já aquecida", async () => {
  const book = await testBook();
  await list();
  expect((await list()).cache).toBe("HIT");
  expect((await api("POST", "/livros", { isbn: book.isbn, titulo: book.titulo, autorId: book.autorId })).status).toBe(409);
  const afterFailure = await list();
  expect(afterFailure.cache).toBe("HIT");
  expect(afterFailure.books.filter(b => b.id === book.id)).toHaveLength(1);
});
