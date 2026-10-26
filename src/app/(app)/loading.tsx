import { HeaderShape, LoadingPage, RowsShape, TabsShape } from "@/components/loading-shapes";

// Запасна форма для сторінок без власного loading.tsx — Decisions (і вітрини /design): власний loading.tsx вона мати не може, бо він
// ремаунтився б на кожен `?record=` і блимав би скелетоном. Тут Suspense обгортає сегмент `decisions` цілком, а його
// ключ від параметрів не залежить. Форма — заголовок, вкладки й список записів.
export default function Loading() {
  return (
    <LoadingPage>
      <HeaderShape action={false} />
      <TabsShape widths={["w-44", "w-24"]} />
      <RowsShape rows={5} />
    </LoadingPage>
  );
}
