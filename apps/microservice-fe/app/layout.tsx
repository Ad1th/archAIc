import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "archAIc Microservice Frontend",
  description: "Shopping frontend powered by the archAIc microservices stack.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
