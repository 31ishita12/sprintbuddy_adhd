import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "sprint buddy, get your shit done",
  description: "turn overwhelm into tiny actions you can actually finish.",
  metadataBase: new URL("https://makesomething.so"),
  openGraph: {
    title: "sprint buddy, get your shit done",
    description: "turn overwhelm into tiny actions you can actually finish.",
    siteName: "sprint buddy",
  },
  twitter: {
    card: "summary_large_image",
    title: "sprint buddy, get your shit done",
    description: "turn overwhelm into tiny actions you can actually finish.",
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
