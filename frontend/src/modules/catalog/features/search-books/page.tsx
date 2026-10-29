/* oxlint-disable react/only-export-components -- Cada page.tsx exporta metadados e componente para o carregamento automático. */
import { useSearchParams } from "react-router-dom";
import { Loading } from "../../../../shared/ui/feedback.tsx";
import { SearchForm } from "../../../../shared/ui/fields.tsx";
import { Page } from "../../../../shared/ui/Page.tsx";
import { BooksTable } from "../../components/BooksTable.tsx";
import { useFetch } from "../../../../shared/useFetch.ts";
import type { Book } from "../../types.ts";

function SearchBooks() {
  const [params] = useSearchParams();
  const term = params.get("q") ?? "";
  const books = useFetch<Book[]>(`/api/livros?q=${encodeURIComponent(term)}`);
  return <Page title="Buscar livros" description="Consulte ISBN, título ou autor e veja as cópias disponíveis de cada edição.">
    <SearchForm hint="ISBN, título ou nome do autor" />
    <Loading loading={books.loading} error={books.error} />
    {books.data && (books.data.length ? <>
      <p className="count">{books.data.length} livro(s) encontrado(s)</p>
      <BooksTable books={books.data} />
    </> : <p className="empty">Nenhum livro encontrado. Ajuste a busca ou cadastre um livro.</p>)}
  </Page>;
}

export default { useCase: "UC02", title: "Buscar livros", path: "/livros", Component: SearchBooks };
