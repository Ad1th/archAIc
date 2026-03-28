"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";

import { Navbar } from "@/app/microservice-fe/components/Navbar";
import { ProductGridSkeleton } from "@/app/microservice-fe/components/LoadingSkeleton";
import { ProductCard } from "@/app/microservice-fe/components/ProductCard";
import {
  addToCart,
  clearStoredToken,
  getCart,
  getProducts,
  StorefrontError,
} from "@/app/microservice-fe/lib/client";
import { Product } from "@/app/microservice-fe/lib/types";

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [cartCount, setCartCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pendingProductId, setPendingProductId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hardFailure, setHardFailure] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [productsResponse, cartResponse] = await Promise.all([getProducts(), getCart()]);
        if (!active) {
          return;
        }
        setProducts(productsResponse.products);
        setCartCount(cartResponse.items.reduce((sum, item) => sum + item.quantity, 0));
      } catch (caughtError) {
        if (!active) {
          return;
        }
        const status = caughtError instanceof StorefrontError ? caughtError.status : 500;
        if (status === 401) {
          clearStoredToken();
          router.push("/microservice-fe/login");
          return;
        }
        setHardFailure(status === 503);
        setError(caughtError instanceof Error ? caughtError.message : "Failed to load products.");
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

  const collectionLabel = useMemo(() => `${products.length} live products`, [products.length]);

  const handleAddToCart = async (productId: string) => {
    setPendingProductId(productId);

    try {
      const response = await addToCart(productId);
      setCartCount(response.cart.reduce((sum, item) => sum + item.quantity, 0));
    } catch (caughtError) {
      const status = caughtError instanceof StorefrontError ? caughtError.status : 500;
      if (status === 401) {
        clearStoredToken();
        router.push("/microservice-fe/login");
        return;
      }
      setHardFailure(status === 503);
      setError(caughtError instanceof Error ? caughtError.message : "Unable to update cart.");
      throw caughtError;
    } finally {
      setPendingProductId(null);
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
        <div className="mb-8 rounded-[34px] border border-white/60 bg-[rgba(255,255,255,0.58)] p-7 shadow-md backdrop-blur-md">
          <p className="text-xs uppercase tracking-[0.28em] text-[#a1876b]">{collectionLabel}</p>
          <h1 className="mt-4 text-5xl font-semibold tracking-tight text-[#1e1e1e]">The live product collection.</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[#6b6b6b]">
            Each card is backed by the product-service and protected by the auth-service token flow.
          </p>
        </div>

        {error ? (
          <motion.div
            animate={hardFailure ? { x: [0, -8, 8, -4, 4, 0] } : { opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="mb-6 flex items-start gap-3 rounded-[28px] border border-[#e6bbb1] bg-[rgba(255,239,235,0.9)] px-5 py-4 text-[#8b4335] shadow-sm"
          >
            <AlertTriangle className="mt-0.5 h-5 w-5" />
            <span>{error}</span>
          </motion.div>
        ) : null}

        {loading ? (
          <ProductGridSkeleton />
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                busy={pendingProductId === product.id}
                onAddToCart={handleAddToCart}
              />
            ))}
          </div>
        )}
      </motion.section>
    </main>
  );
}
