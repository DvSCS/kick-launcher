import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Launcher — Kick Stream Tool",
  description: "Ferramenta para transmissão ao vivo na Kick.",
  icons: {
    icon: "/kick-logo.svg",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
