import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Salah Sync",
  description: "Sync your daily schedules with Salah.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="antialiased"
      >
        {children}
      </body>
    </html>
  );
}
