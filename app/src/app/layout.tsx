import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { CookieBanner } from "@/components/layout/CookieBanner";
import { ErrorReporter } from "@/components/layout/ErrorReporter";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { ToastProvider } from "@/components/ui/Toast";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Threshold — design your entrance door", template: "%s · Threshold" },
  description: "Design your entrance door in a few steps and see it on your own home.",
};

export const viewport: Viewport = { themeColor: "#eef0f4", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
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
