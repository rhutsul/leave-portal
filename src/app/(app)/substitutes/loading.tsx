import { HeaderShape, LoadingPage, RowsShape } from "@/components/loading-shapes";

// Substitutes: заголовок без дії й список працівників (для редактора — список і форма додавання).
export default function Loading() {
  return (
    <LoadingPage>
      <HeaderShape action={false} />
      <RowsShape rows={5} />
    </LoadingPage>
  );
}
