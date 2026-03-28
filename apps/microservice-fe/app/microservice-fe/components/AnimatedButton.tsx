"use client";

import { HTMLMotionProps, motion } from "framer-motion";
import * as React from "react";

import { cn } from "@/lib/utils";

type AnimatedButtonProps = HTMLMotionProps<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
};

export function AnimatedButton({
  className,
  children,
  variant = "primary",
  loading = false,
  disabled,
  ...props
}: AnimatedButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      whileHover={{ y: -1 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={cn(
        "inline-flex min-h-11 items-center justify-center rounded-2xl px-5 py-3 text-sm font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-60",
        variant === "primary" &&
          "bg-[#c56a3d] text-white shadow-sm hover:bg-[#b76036] hover:shadow-md",
        variant === "secondary" &&
          "border border-[#e8e2d9] bg-[rgba(255,255,255,0.72)] text-[#1e1e1e] shadow-sm hover:bg-[rgba(255,255,255,0.92)] hover:shadow-md",
        variant === "ghost" &&
          "bg-transparent text-[#6c5a4d] hover:bg-white/40",
        variant === "danger" &&
          "bg-[#d48f84] text-[#4c2019] shadow-sm hover:bg-[#cb8579]",
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <span className="h-4 w-20 animate-pulse rounded-full bg-white/25" /> : children}
    </motion.button>
  );
}
