/* oxlint-disable react/only-export-components -- Cada page.tsx exporta metadados e componente para o carregamento automático. */
import { Loading } from "../../../../shared/ui/feedback.tsx";
import { Page } from "../../../../shared/ui/Page.tsx";
import { useFetch } from "../../../../shared/useFetch.ts";
import { BooksTable } from "../../components/BooksTable.tsx";
import type { Book } from "../../types.ts";

function ListBooks() {
  const books = useFetch<Book[]>("/api/livros");
  return <Page title="Listar livros" description="Consulte todo o acervo em ordem de título e veja os exemplares disponíveis.">
    <Loading loading={books.loading} error={books.error} />
    {books.data && (books.data.length ? <>
      <p className="count">{books.data.length} livro(s) no acervo</p>
      <BooksTable books={books.data} />
    </> : <p className="empty">Nenhum livro cadastrado no acervo.</p>)}
  </Page>;
}

export default { useCase: "UC02", title: "Listar livros", path: "/livros/listar", Component: ListBooks };
