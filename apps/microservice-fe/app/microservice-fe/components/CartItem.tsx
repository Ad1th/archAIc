"use client";

import { motion } from "framer-motion";
import { MinusCircle, PlusCircle } from "lucide-react";

import { CartItemType } from "@/app/microservice-fe/lib/types";

export function CartItem({ item }: { item: CartItemType }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[28px] border border-white/60 bg-[rgba(255,255,255,0.62)] p-5 shadow-sm backdrop-blur-md"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xl font-semibold text-[#1e1e1e]">{item.name}</p>
          <p className="mt-2 text-sm text-[#6b6b6b]">Product ID: {item.product_id}</p>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 rounded-full border border-white/70 bg-white/70 px-3 py-2 text-[#8a7258]">
            <MinusCircle className="h-4 w-4 opacity-55" />
            <span className="min-w-8 text-center text-sm font-medium text-[#1e1e1e]">{item.quantity}</span>
            <PlusCircle className="h-4 w-4 opacity-55" />
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-[0.24em] text-[#a1876b]">Line total</p>
            <p className="mt-1 text-xl font-semibold text-[#1e1e1e]">
              ${(item.price * item.quantity).toFixed(2)}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
