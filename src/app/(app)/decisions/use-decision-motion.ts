"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { DecideState } from "./actions";
import { useSheetMotion } from "./record-sheet";

/** Скільки триває кожен крок руху рішення (ADR 0007): печатка, потім виїзд панелі вгору. */
const STAMP_MS = 620;
const LEAVE_MS = 320;

/**
 * Рішення збережено (ADR 0007): печатка в панелі, рядок у списку виїжджає, панель ковзає вгору — і відкривається
 * наступний запис черги. Без руху (prefers-reduced-motion) — одразу.
 */
export function useDecisionMotion(done: DecideState["done"], recordId: number) {
  const router = useRouter();
  const motion = useSheetMotion();
  useEffect(() => {
    if (!done) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      router.replace(done.href, { scroll: false });
      return;
    }
    if (done.status === "approved" || done.status === "rejected" || done.status === "returned") motion.stamp(done.status);
    document.querySelector(`[data-record-row="${recordId}"]`)?.setAttribute("data-leaving", "");
    const leave = setTimeout(motion.leave, STAMP_MS);
    const go = setTimeout(() => router.replace(done.href, { scroll: false }), STAMP_MS + LEAVE_MS);
    return () => {
      clearTimeout(leave);
      clearTimeout(go);
    };
  }, [done, motion, recordId, router]);
}
