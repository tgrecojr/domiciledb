import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DomicileDB",
  description:
    "Self-hosted home inventory — prove what you owned and get paid after a disaster.",
  applicationName: "DomicileDB",
  appleWebApp: {
    capable: true,
    title: "DomicileDB",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#16a34a",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-full">
        <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}
