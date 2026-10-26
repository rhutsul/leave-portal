"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

/**
 * Панель, що виїжджає справа поверх сторінки (Dialog з Base UI): фокус усередині, Esc і клік по затемненню
 * закривають. Список під нею видно крізь легке затемнення `scrim` — це робоча панель, а не питання, як Dialog.
 */
function Sheet(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetClose(props: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetContent({ className, children, ...props }: DialogPrimitive.Popup.Props) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        data-slot="sheet-overlay"
        className="fixed inset-0 isolate z-50 bg-scrim/25 duration-(--duration-base) data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
      />
      <DialogPrimitive.Popup
        data-slot="sheet-content"
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-[460px] flex-col border-l border-border bg-popover text-sm text-popover-foreground shadow-lg duration-(--duration-base) ease-out outline-none data-open:animate-in data-open:slide-in-from-right-8 data-open:fade-in-0 data-closed:animate-out data-closed:slide-out-to-right-8 data-closed:fade-out-0",
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

/** Шапка: заголовок і опис ліворуч, дії (навігація, закрити) праворуч; під нею — межа на всю ширину. */
function SheetHeader({ className, children, actions }: { className?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div data-slot="sheet-header" className={cn("flex items-start gap-3 border-b border-border px-5 py-4", className)}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">{children}</div>
      <div className="flex shrink-0 items-center gap-1">
        {actions}
        <SheetClose render={<Button variant="ghost" size="icon-sm" aria-label="Close" />}>
          <XIcon />
        </SheetClose>
      </div>
    </div>
  );
}

function SheetTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return <DialogPrimitive.Title data-slot="sheet-title" className={cn("text-base font-semibold", className)} {...props} />;
}

function SheetDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="sheet-description"
      className={cn("truncate text-[13px] text-muted-foreground", className)}
      {...props}
    />
  );
}

/** Тіло панелі прокручується саме, шапка лишається на місці. */
function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sheet-body" className={cn("flex-1 overflow-y-auto px-5 py-5", className)} {...props} />;
}

export { Sheet, SheetBody, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle };
