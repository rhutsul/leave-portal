"use client";

import { useState } from "react";
import { isHydrated } from "@/components/ui/motion";
import { cn } from "@/lib/utils";

// Новий вміст сторінки з'являється з підйомом на 6 px і проявленням (DESIGN.md, розділ 11) — лише після переходу між
// розділами: template.tsx перемонтовується саме тоді, а зміна ?record= чи ?year= на тій самій сторінці — ні. Перше
// завантаження показує сторінку з сервера одразу, без руху.
export default function Template({ children }: { children: React.ReactNode }) {
  const [animate] = useState(isHydrated);
  return <div className={cn("flex flex-col gap-6", animate && "animate-page-in")}>{children}</div>;
}
