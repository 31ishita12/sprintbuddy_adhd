import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "makesomething ☀️",
  description: "build your first app with ai. look what i made!",
  metadataBase: new URL("https://makesomething.so"),
  openGraph: {
    title: "makesomething ☀️",
    description: "look what i made!",
    siteName: "makesomething",
  },
  twitter: {
    card: "summary_large_image",
    title: "makesomething ☀️",
    description: "look what i made!",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <body className="min-h-screen text-foreground bg-background font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
