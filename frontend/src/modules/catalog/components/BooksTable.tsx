import { Link } from "react-router-dom";
import { formatDate } from "../../../shared/format.ts";
import { RowActions, Table } from "../../../shared/ui/Table.tsx";
import type { Book } from "../types.ts";

export function BooksTable({ books }: { books: Book[] }) {
  return (
      <Table label="Livros encontrados"><thead><tr><th>Título / ISBN</th><th>Autor</th><th>Exemplares</th><th>Catalogação</th><th>Ações</th></tr></thead><tbody>
        {books.map((book) => <tr key={book.id}>
          <td><strong>{book.titulo}</strong><small className="secondary-line">{book.isbn}</small></td>
          <td>{book.autor}</td>
          <td><Link to={`/exemplares?livroId=${book.id}`}>{book.exemplaresDisponiveis} disponível(is) / {book.totalExemplares} total</Link></td>
          <td>{formatDate(book.dataCatalogacao)}</td>
          <td><RowActions edit={`/livros/editar?id=${book.id}`} remove={`/livros/excluir?id=${book.id}`} /></td>
        </tr>)}
      </tbody></Table>
  );
}
