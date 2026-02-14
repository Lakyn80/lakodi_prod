import type { ReactNode } from "react";
import Header from "./Header";
import Footer from "./Footer";
import MobileBottomBar from "./MobileBottomBar";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col pb-20 lg:pb-0">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
      <MobileBottomBar />
    </div>
  );
}
