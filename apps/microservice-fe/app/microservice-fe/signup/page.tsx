"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

import { AnimatedButton } from "@/app/microservice-fe/components/AnimatedButton";
import { Navbar } from "@/app/microservice-fe/components/Navbar";
import { setStoredToken, signup, StorefrontError } from "@/app/microservice-fe/lib/client";
import { cn } from "@/lib/utils";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorMode, setErrorMode] = useState<"soft" | "hard">("soft");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await signup(email, password);
      setStoredToken(response.access_token);
      router.push("/microservice-fe/products");
    } catch (caughtError) {
      const status = caughtError instanceof StorefrontError ? caughtError.status : 500;
      setErrorMode(status === 503 ? "hard" : "soft");
      setError(caughtError instanceof Error ? caughtError.message : "Unable to create your account.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f6f1eb] pb-12">
      <Navbar />
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="mx-auto flex max-w-7xl items-center px-4 pt-12 sm:px-6"
      >
        <div className="grid w-full gap-8 lg:grid-cols-[1.05fr,0.95fr]">
          <motion.form
            onSubmit={handleSubmit}
            animate={error ? { x: [0, -8, 8, -4, 4, 0] } : { x: 0 }}
            transition={{ duration: 0.35 }}
            className={cn(
              "rounded-[36px] border border-white/60 bg-[rgba(255,255,255,0.64)] p-8 shadow-md backdrop-blur-md",
              errorMode === "hard" && error ? "border-[#d48f84] bg-[rgba(255,239,235,0.88)]" : "",
            )}
          >
            <h1 className="text-4xl font-semibold tracking-tight text-[#1e1e1e]">Create your account.</h1>
            <p className="mt-4 max-w-lg text-base leading-7 text-[#6b6b6b]">
              Sign up through the auth-service and move directly into the protected shopping experience.
            </p>

            <div className="mt-8 space-y-6">
              <div>
                <label className="mb-2 block text-sm font-medium text-[#6b6b6b]">Email</label>
                <input
                  className="w-full rounded-2xl border border-[#e8e2d9] bg-white/70 px-4 py-3 text-[#1e1e1e] outline-none transition-all duration-200 focus:border-[#c56a3d] focus:ring-2 focus:ring-[#d6b98c]"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-[#6b6b6b]">Password</label>
                <input
                  className="w-full rounded-2xl border border-[#e8e2d9] bg-white/70 px-4 py-3 text-[#1e1e1e] outline-none transition-all duration-200 focus:border-[#c56a3d] focus:ring-2 focus:ring-[#d6b98c]"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
            </div>

            {error ? (
              <div className="mt-5 rounded-2xl border border-[#e7b2a9] bg-[#fff1ee] px-4 py-3 text-sm text-[#8b4335]">
                {error}
              </div>
            ) : null}

            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <AnimatedButton type="submit" loading={loading} className="min-w-44">
                Create account
              </AnimatedButton>
              <Link href="/microservice-fe/login" className="text-sm font-medium text-[#8a7258] underline-offset-4 hover:underline">
                Already have an account?
              </Link>
            </div>
          </motion.form>

          <div className="rounded-[36px] border border-white/60 bg-[rgba(255,255,255,0.58)] p-8 shadow-md backdrop-blur-md">
            <p className="text-xs uppercase tracking-[0.28em] text-[#a1876b]">Warm minimal luxury</p>
            <h2 className="mt-5 text-5xl font-semibold tracking-tight text-[#1e1e1e]">Designed to feel effortless.</h2>
            <p className="mt-5 text-base leading-7 text-[#6b6b6b]">
              Soft glass panels, fast transitions, and API-driven commerce built on top of distributed backend
              services, not static demos.
            </p>
          </div>
        </div>
      </motion.section>
    </main>
  );
}
