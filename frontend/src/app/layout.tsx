import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Email Productivity Agent",
  description:
    "Prompt-driven intelligent Email Productivity Agent for categorization, action extraction, chat Q&A, and safe draft generation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
