"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Layers3, ShieldCheck, ShoppingBag } from "lucide-react";

import { AnimatedButton } from "@/app/microservice-fe/components/AnimatedButton";
import { Navbar } from "@/app/microservice-fe/components/Navbar";

const FloatingParticles = dynamic(
  () => import("@/app/microservice-fe/components/FloatingParticles"),
  { ssr: false },
);

export default function MicroserviceLandingPage() {
  return (
    <main className="min-h-screen bg-[#f6f1eb] pb-16">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(214,185,140,0.22),transparent_38%)]" />
        <div className="absolute inset-0">
          <FloatingParticles />
        </div>

        <div className="relative">
          <Navbar />

          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="mx-auto grid min-h-[88vh] max-w-7xl gap-10 px-4 pt-12 sm:px-6 lg:grid-cols-[1.15fr,0.85fr] lg:items-center"
          >
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-[rgba(255,255,255,0.65)] px-4 py-2 text-xs uppercase tracking-[0.28em] text-[#9b7d5e] shadow-sm backdrop-blur-md">
                liquid glass storefront
              </div>
              <div className="space-y-6">
                <h1 className="max-w-4xl text-5xl font-semibold leading-[1.02] tracking-tight text-[#1e1e1e] md:text-7xl">
                  Shop through a distributed system without seeing the seams.
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-[#6b6b6b]">
                  A warm, cinematic frontend for auth, catalog, cart, and checkout flows powered by independent
                  FastAPI microservices under the surface.
                </p>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row">
                <Link href="/microservice-fe/products">
                  <AnimatedButton className="min-w-44">
                    Explore products
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </AnimatedButton>
                </Link>
                <Link href="/microservice-fe/signup">
                  <AnimatedButton variant="secondary" className="min-w-44">
                    Create account
                  </AnimatedButton>
                </Link>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <FeaturePill icon={ShieldCheck} title="Auth-backed" text="Secure login and token propagation." />
                <FeaturePill icon={Layers3} title="Traceable" text="Every request maps back to a service path." />
                <FeaturePill icon={ShoppingBag} title="Checkout-ready" text="Catalog to payment in one motion." />
              </div>
            </div>

            <div className="grid gap-5">
              <ShowcaseCard
                eyebrow="Seamless auth"
                title="Protected catalog with graceful service-aware UX."
                body="Token storage, protected product fetches, cart persistence, and animated failure feedback for unstable upstreams."
              />
              <ShowcaseCard
                eyebrow="Motion language"
                title="Liquid glass panels, warm depth, and featherweight animation."
                body="Every surface uses layered blur, soft borders, and subtle motion tuned for performance."
              />
            </div>
          </motion.section>
        </div>
      </div>
    </main>
  );
}

function FeaturePill({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-[26px] border border-white/60 bg-[rgba(255,255,255,0.54)] p-5 shadow-sm backdrop-blur-md">
      <Icon className="h-5 w-5 text-[#c56a3d]" />
      <p className="mt-4 font-medium text-[#1e1e1e]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[#6b6b6b]">{text}</p>
    </div>
  );
}

function ShowcaseCard({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -6 }}
      transition={{ duration: 0.22 }}
      className="rounded-[34px] border border-white/65 bg-[linear-gradient(180deg,rgba(255,255,255,0.7),rgba(255,255,255,0.45))] p-7 shadow-md backdrop-blur-md"
    >
      <p className="text-xs uppercase tracking-[0.28em] text-[#a1876b]">{eyebrow}</p>
      <h2 className="mt-5 text-3xl font-semibold leading-tight text-[#1e1e1e]">{title}</h2>
      <p className="mt-4 text-base leading-7 text-[#6b6b6b]">{body}</p>
    </motion.div>
  );
}
