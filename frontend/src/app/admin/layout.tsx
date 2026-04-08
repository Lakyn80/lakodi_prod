import type { Metadata } from "next";
import AdminLayoutClient from "./AdminLayoutClient";

export const metadata: Metadata = {
  manifest: "/admin/manifest.webmanifest",
  title: {
    default: "Admin",
    template: "%s | Lakodi Admin",
  },
  appleWebApp: {
    capable: true,
    title: "Lakodi Admin",
    statusBarStyle: "default",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
