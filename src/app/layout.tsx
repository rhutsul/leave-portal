import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { TooltipProvider } from "@/components/ui/tooltip";
import { parseTheme, THEME_COOKIE, themeAttribute } from "@/lib/preferences";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Leave portal",
  description: "School staff leave requests by schedule",
};

// viewport-fit=cover: закріплені внизу панелі відступають від смуги жестів iPhone через env(safe-area-inset-bottom)
// (ADR 0008). Ширину й масштаб Next задає сам.
export const viewport: Viewport = { viewportFit: "cover" };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Тема з cookie (ADR 0005): Light чи Dark сервер пише в data-theme одразу, тож сторінка не блимає іншою темою;
  // System — без атрибута, далі вирішує prefers-color-scheme у globals.css.
  const theme = themeAttribute(parseTheme((await cookies()).get(THEME_COOKIE)?.value));
  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
