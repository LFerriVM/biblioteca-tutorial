import { sql } from "../../../../infrastructure/postgres";
import { civilDate } from "../../../../shared/dates";
import type { BookView } from "../../domain/Book";
import type { CatalogIntegration } from "../../domain/CatalogIntegration";
import { listBookViews } from "../../infrastructure/books";

export async function listBooks(integration: CatalogIntegration, now = new Date()): Promise<BookView[]> {
  return listBookViews(sql, integration, civilDate(now));
}
