"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

import { AnimatedButton } from "@/app/microservice-fe/components/AnimatedButton";
import { CartItem } from "@/app/microservice-fe/components/CartItem";
import { CartSkeleton } from "@/app/microservice-fe/components/LoadingSkeleton";
import { Navbar } from "@/app/microservice-fe/components/Navbar";
import { clearStoredToken, getCart, StorefrontError } from "@/app/microservice-fe/lib/client";
import { CartResponse } from "@/app/microservice-fe/lib/types";

export default function CartPage() {
  const router = useRouter();
  const [cart, setCart] = useState<CartResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await getCart();
        if (active) {
          setCart(response);
        }
      } catch (caughtError) {
        const status = caughtError instanceof StorefrontError ? caughtError.status : 500;
        if (status === 401) {
          clearStoredToken();
          router.push("/microservice-fe/login");
          return;
        }
        if (active) {
          setError(caughtError instanceof Error ? caughtError.message : "Failed to load cart.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [router]);

  const cartCount = useMemo(
    () => cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0,
    [cart],
  );

  return (
    <main className="min-h-screen bg-[#f6f1eb] pb-16">
      <Navbar cartCount={cartCount} isAuthenticated />

      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="mx-auto max-w-7xl px-4 pt-12 sm:px-6"
      >
        <div className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-[#a1876b]">Cart review</p>
            <h1 className="mt-4 text-5xl font-semibold tracking-tight text-[#1e1e1e]">Your current basket.</h1>
          </div>
          <Link href="/microservice-fe/products">
            <AnimatedButton variant="secondary">Continue shopping</AnimatedButton>
          </Link>
        </div>

        {error ? (
          <div className="mb-6 rounded-[28px] border border-[#e6bbb1] bg-[rgba(255,239,235,0.9)] px-5 py-4 text-[#8b4335] shadow-sm">
            {error}
          </div>
        ) : null}

        <div className="grid gap-8 lg:grid-cols-[1.15fr,0.85fr]">
          <div>{loading ? <CartSkeleton /> : <div className="space-y-4">{cart?.items.map((item) => <CartItem key={item.product_id} item={item} />)}</div>}</div>

          <aside className="rounded-[34px] border border-white/60 bg-[rgba(255,255,255,0.6)] p-7 shadow-md backdrop-blur-md">
            <p className="text-xs uppercase tracking-[0.28em] text-[#a1876b]">Summary</p>
            <div className="mt-6 space-y-4">
              <SummaryRow label="Items" value={String(cartCount)} />
              <SummaryRow label="Services" value="auth + product + db" />
              <SummaryRow label="Estimated total" value={`$${(cart?.total ?? 0).toFixed(2)}`} emphasized />
            </div>

            <Link href="/microservice-fe/checkout" className="mt-8 block">
              <AnimatedButton className="w-full" disabled={!cartCount}>
                Continue to checkout
              </AnimatedButton>
            </Link>
          </aside>
        </div>
      </motion.section>
    </main>
  );
}

function SummaryRow({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/65 bg-white/55 px-4 py-3">
      <span className="text-sm text-[#6b6b6b]">{label}</span>
      <span className={emphasized ? "text-lg font-semibold text-[#1e1e1e]" : "text-sm font-medium text-[#1e1e1e]"}>
        {value}
      </span>
    </div>
  );
}
