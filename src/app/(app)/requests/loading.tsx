import { HeaderShape, LoadingPage, RowsShape, TabsShape } from "@/components/loading-shapes";

// My requests: заголовок з «New request», вкладки статусів і таблиця записів, згрупована за місяцем.
export default function Loading() {
  return (
    <LoadingPage>
      <HeaderShape />
      <TabsShape widths={["w-14", "w-40", "w-44", "w-28", "w-48"]} />
      <RowsShape rows={6} />
    </LoadingPage>
  );
}
