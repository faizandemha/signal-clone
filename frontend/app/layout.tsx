import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { SocketProvider } from "@/lib/socket-context";
import { ToastProvider } from "@/components/Toast";

export const metadata: Metadata = {
  title: "Signal",
  description: "A Signal-inspired secure messaging clone (assignment project).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const theme = localStorage.getItem('signal_theme');
                if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.classList.add('dark');
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <AuthProvider>
          <SocketProvider>
            <ToastProvider>{children}</ToastProvider>
          </SocketProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
