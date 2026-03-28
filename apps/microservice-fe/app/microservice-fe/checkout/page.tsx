"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ExternalLink, ShieldCheck } from "lucide-react";

import { AnimatedButton } from "@/app/microservice-fe/components/AnimatedButton";
import { CartSkeleton } from "@/app/microservice-fe/components/LoadingSkeleton";
import { Navbar } from "@/app/microservice-fe/components/Navbar";
import {
  clearStoredToken,
  createCheckout,
  getCart,
  StorefrontError,
} from "@/app/microservice-fe/lib/client";
import { CartResponse } from "@/app/microservice-fe/lib/types";

export default function CheckoutPage() {
  const router = useRouter();
  const [cart, setCart] = useState<CartResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hardFailure, setHardFailure] = useState(false);

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
          setHardFailure(status === 503);
          setError(caughtError instanceof Error ? caughtError.message : "Unable to load checkout.");
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

  const handleCheckout = async () => {
    setCheckoutLoading(true);
    setError(null);

    try {
      const response = await createCheckout();
      window.location.href = response.checkout_url;
    } catch (caughtError) {
      const status = caughtError instanceof StorefrontError ? caughtError.status : 500;
      if (status === 401) {
        clearStoredToken();
        router.push("/microservice-fe/login");
        return;
      }
      setHardFailure(status === 503);
      setError(caughtError instanceof Error ? caughtError.message : "Checkout could not start.");
    } finally {
      setCheckoutLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f6f1eb] pb-16">
      <Navbar cartCount={cartCount} isAuthenticated />

      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="mx-auto max-w-7xl px-4 pt-12 sm:px-6"
      >
        <div className="grid gap-8 lg:grid-cols-[1.05fr,0.95fr]">
          <div className="rounded-[36px] border border-white/60 bg-[rgba(255,255,255,0.58)] p-8 shadow-md backdrop-blur-md">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 px-4 py-2 text-xs uppercase tracking-[0.28em] text-[#9b7d5e]">
              <ShieldCheck className="h-4 w-4" />
              payment-service handoff
            </div>
            <h1 className="mt-6 text-5xl font-semibold tracking-tight text-[#1e1e1e]">Ready for checkout.</h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-[#6b6b6b]">
              This final step calls the payment-service, which validates identity, reads the cart from DB, and
              creates a checkout session.
            </p>

            {error ? (
              <motion.div
                animate={hardFailure ? { x: [0, -8, 8, -4, 4, 0] } : { opacity: 1 }}
                transition={{ duration: 0.4 }}
                className="mt-6 rounded-2xl border border-[#e6bbb1] bg-[rgba(255,239,235,0.9)] px-4 py-3 text-sm text-[#8b4335]"
              >
                {error}
              </motion.div>
            ) : null}
          </div>

          <div className="rounded-[36px] border border-white/60 bg-[rgba(255,255,255,0.64)] p-8 shadow-md backdrop-blur-md">
            {loading ? (
              <CartSkeleton />
            ) : (
              <>
                <div className="space-y-4">
                  <SummaryRow label="Items in cart" value={String(cartCount)} />
                  <SummaryRow label="Checkout total" value={`$${(cart?.total ?? 0).toFixed(2)}`} emphasized />
                  <SummaryRow label="Payment route" value="/create-checkout-session" />
                </div>

                <AnimatedButton
                  onClick={handleCheckout}
                  loading={checkoutLoading}
                  disabled={!cartCount}
                  className="mt-8 w-full"
                >
                  Continue to payment
                  <ExternalLink className="ml-2 h-4 w-4" />
                </AnimatedButton>
              </>
            )}
          </div>
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
