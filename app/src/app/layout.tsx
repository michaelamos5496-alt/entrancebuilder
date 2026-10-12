import type { Metadata, Viewport } from "next";
import { Roboto } from "next/font/google";
import "./globals.css";
import { CookieBanner } from "@/components/layout/CookieBanner";
import { ErrorReporter } from "@/components/layout/ErrorReporter";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { ToastProvider } from "@/components/ui/Toast";

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Threshold — design your entrance door", template: "%s · Threshold" },
  description: "Design your entrance door in a few steps and see it on your own home.",
};

export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={roboto.variable}>
      <body className="flex min-h-svh flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-ink focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to content
        </a>
        <ToastProvider>
          <SiteHeader />
          <main id="main" className="flex-1">{children}</main>
          <SiteFooter />
          <CookieBanner />
          <ErrorReporter />
        </ToastProvider>
      </body>
    </html>
  );
}
