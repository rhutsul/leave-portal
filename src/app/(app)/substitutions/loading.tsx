import { HeaderShape, LoadingPage, RowsShape } from "@/components/loading-shapes";

// My substitutions: заголовок без дії й таблиця записів.
export default function Loading() {
  return (
    <LoadingPage>
      <HeaderShape action={false} />
      <RowsShape rows={4} />
    </LoadingPage>
  );
}
