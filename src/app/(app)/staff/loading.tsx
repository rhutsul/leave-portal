import { HeaderShape, LoadingPage, RowsShape } from "@/components/loading-shapes";

// Employees: заголовок з дією «Add employee» і список працівників; для сторінки працівника й форми — так само.
export default function Loading() {
  return (
    <LoadingPage>
      <HeaderShape />
      <RowsShape rows={6} />
    </LoadingPage>
  );
}
