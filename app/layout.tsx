import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Longevity Evidence Layer",
  description: "Normalize aging and preventive-health signals into a longitudinal clinical evidence record.",
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

