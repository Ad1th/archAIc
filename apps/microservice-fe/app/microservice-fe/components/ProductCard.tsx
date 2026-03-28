"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ShoppingBag, Sparkles } from "lucide-react";

import { AnimatedButton } from "@/app/microservice-fe/components/AnimatedButton";
import { Product } from "@/app/microservice-fe/lib/types";
import { cn } from "@/lib/utils";

type ProductCardProps = {
  product: Product;
  onAddToCart: (productId: string) => Promise<void>;
  busy?: boolean;
};

type EffectState = {
  id: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

export function ProductCard({ product, onAddToCart, busy = false }: ProductCardProps) {
  const [effect, setEffect] = useState<EffectState | null>(null);
  const [flashError, setFlashError] = useState(false);

  const handleAdd = async (event: React.MouseEvent<HTMLButtonElement>) => {
    const cartAnchor = document.querySelector("[data-cart-icon]");
    const buttonRect = event.currentTarget.getBoundingClientRect();
    const cartRect = cartAnchor?.getBoundingClientRect();

    if (cartRect) {
      setEffect({
        id: Date.now(),
        startX: buttonRect.left + buttonRect.width / 2,
        startY: buttonRect.top + buttonRect.height / 2,
        endX: cartRect.left + cartRect.width / 2,
        endY: cartRect.top + cartRect.height / 2,
      });
    }

    try {
      await onAddToCart(product.id);
    } catch {
      setFlashError(true);
      window.setTimeout(() => setFlashError(false), 500);
    }
  };

  return (
    <>
      <motion.article
        whileHover={{ y: -8 }}
        transition={{ duration: 0.24, ease: "easeOut" }}
        className={cn(
          "group relative overflow-hidden rounded-[30px] border border-white/60 bg-[rgba(255,255,255,0.58)] p-5 shadow-sm backdrop-blur-md transition-all duration-200 hover:shadow-xl",
          flashError && "border-[#d48f84] bg-[rgba(255,237,233,0.82)]",
        )}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(214,185,140,0.22),transparent_38%)]" />
        <div className="relative flex h-full flex-col gap-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/60 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-[#8e7359]">
                <Sparkles className="h-3.5 w-3.5" />
                distributed catalog
              </span>
              <div>
                <h3 className="text-2xl font-semibold tracking-tight text-[#1e1e1e]">
                  {product.name ?? "Corrupted product payload"}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[#6b6b6b]">
                  Real inventory from the product microservice, surfaced through the shared auth + DB request path.
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-white/70 bg-white/70 p-3 shadow-sm">
              <ShoppingBag className="h-5 w-5 text-[#c56a3d]" />
            </div>
          </div>

          <div className="mt-auto flex items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-[#a1876b]">Price</p>
              <p className="mt-2 text-3xl font-semibold text-[#1e1e1e]">
                ${Number(product.price).toFixed(2)}
              </p>
            </div>
            <AnimatedButton
              onClick={handleAdd}
              loading={busy}
              className="min-w-36 overflow-hidden"
            >
              Add to cart
            </AnimatedButton>
          </div>
        </div>
      </motion.article>

      {effect ? (
        <motion.span
          key={effect.id}
          initial={{
            opacity: 0.95,
            scale: 1,
            x: effect.startX,
            y: effect.startY,
          }}
          animate={{
            opacity: 0.25,
            scale: 0.35,
            x: effect.endX,
            y: effect.endY,
          }}
          transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
          onAnimationComplete={() => setEffect(null)}
          className="pointer-events-none fixed left-0 top-0 z-[60] h-3.5 w-3.5 rounded-full bg-[#c56a3d] shadow-[0_0_20px_rgba(197,106,61,0.4)]"
        />
      ) : null}
    </>
  );
}
