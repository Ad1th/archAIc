"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { LogOut, ShoppingBag, Sparkles } from "lucide-react";

import { clearStoredToken } from "@/app/microservice-fe/lib/client";
import { cn } from "@/lib/utils";

type NavbarProps = {
  cartCount?: number;
  isAuthenticated?: boolean;
};

export function Navbar({ cartCount = 0, isAuthenticated = false }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="sticky top-4 z-40 mx-auto w-full max-w-7xl px-4 sm:px-6"
    >
      <div className="rounded-[28px] border border-white/55 bg-[rgba(255,255,255,0.55)] px-5 py-4 shadow-md backdrop-blur-md">
        <div className="flex items-center justify-between gap-4">
          <Link href="/microservice-fe" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#1e1e1e] text-[#f6f1eb]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm uppercase tracking-[0.28em] text-[#9c8367]">archAIc</p>
              <p className="text-sm font-medium text-[#1e1e1e]">Microservice Frontend</p>
            </div>
          </Link>

          <nav className="hidden items-center gap-2 md:flex">
            {[
              { href: "/microservice-fe/products", label: "Products" },
              { href: "/microservice-fe/cart", label: "Cart" },
              { href: "/microservice-fe/checkout", label: "Checkout" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-full px-4 py-2 text-sm transition-all duration-200",
                  pathname === item.href
                    ? "bg-white/80 text-[#1e1e1e] shadow-sm"
                    : "text-[#6b6b6b] hover:bg-white/50 hover:text-[#1e1e1e]",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/microservice-fe/cart"
              className="relative rounded-2xl border border-white/55 bg-[rgba(255,255,255,0.7)] p-3 text-[#1e1e1e] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
            >
              <ShoppingBag className="h-5 w-5" />
              <span
                data-cart-icon
                className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#c56a3d] px-1 text-[10px] font-semibold text-white"
              >
                {cartCount}
              </span>
            </Link>

            {isAuthenticated ? (
              <button
                type="button"
                onClick={() => {
                  clearStoredToken();
                  router.push("/microservice-fe/login");
                }}
                className="rounded-2xl border border-white/55 bg-[rgba(255,255,255,0.6)] p-3 text-[#6b6b6b] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:text-[#1e1e1e] hover:shadow-md"
              >
                <LogOut className="h-5 w-5" />
              </button>
            ) : (
              <Link
                href="/microservice-fe/login"
                className="rounded-2xl border border-white/55 bg-[rgba(255,255,255,0.6)] px-4 py-3 text-sm font-medium text-[#1e1e1e] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
              >
                Log in
              </Link>
            )}
          </div>
        </div>
      </div>
    </motion.header>
  );
}
