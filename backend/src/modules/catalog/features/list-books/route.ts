import type { Hono } from "hono";
import { catalogIntegration } from "../../../../integration/catalogIntegration";
import { bookJson } from "../../infrastructure/json";
import { listBooksCached } from "./listBooksCached";

export function registerRoutes(api: Hono): void {
  api.get("/livros", async (c, next) => {
    // loadSlices registra list-books antes de search-books: termos seguem para a busca.
    if (c.req.query("q")?.trim()) return next();
    const { books, cache } = await listBooksCached(catalogIntegration);
    c.header("X-Cache", cache);
    return c.json(books.map(bookJson));
  });
}
