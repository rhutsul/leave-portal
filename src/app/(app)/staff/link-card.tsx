"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { Copy, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateLong } from "@/lib/leave/time";
import type { IssuedLink } from "@/lib/staff/employee";
import { oneTimeLinkUrl } from "@/lib/staff/link";

// Адреса сайту — з браузера (preview і прод — кожен свою); на сервері — порожньо, поле заповнюється після гідрації.
const subscribe = () => () => {};
const origin = () => window.location.origin;
const noOrigin = () => "";

/**
 * Одноразове посилання, яке щойно видала база (AC-STAFF-01, D2): адреса з токеном у фрагменті, «Copy link» і «Valid
 * until …». Токен живе лише тут — після оновлення сторінки його не відновити, лише видати нове посилання.
 */
export function LinkCard({ link }: { link: IssuedLink }) {
  const id = useId();
  const base = useSyncExternalStore(subscribe, origin, noOrigin);
  const url = base ? oneTimeLinkUrl(base, link.token) : "";
  const [copied, setCopied] = useState<"" | "done" | "failed">("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("done");
    } catch {
      setCopied("failed");
    }
  }

  return (
    <Card className="gap-4" data-testid="one-time-link">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Link2 className="size-4 text-muted-foreground" aria-hidden="true" />
          One-time sign-in link
        </CardTitle>
        <CardDescription>
          Give it to {link.email} in person or through the school&apos;s usual channel. It works once.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id}>Link</Label>
          <div className="flex gap-2 max-sm:flex-col">
            <Input
              id={id}
              readOnly
              value={url}
              aria-describedby={`${id}-until`}
              onFocus={(event) => event.currentTarget.select()}
              className="min-w-0 flex-1 font-mono text-xs"
            />
            <Button type="button" variant="secondary" onClick={copy} disabled={!url} className="pointer-coarse:h-11">
              <Copy />
              Copy link
            </Button>
          </div>
        </div>
        <p id={`${id}-until`} className="text-xs text-muted-foreground tabular-nums" data-testid="link-valid-until">
          Valid until {formatDateLong(link.validUntil)}
        </p>
        <p role="status" className="text-xs text-muted-foreground">
          {copied === "done" ? "Link copied" : copied === "failed" ? "Copy the link from the field above." : ""}
        </p>
      </CardContent>
    </Card>
  );
}
