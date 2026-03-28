export function ProductGridSkeleton() {
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-[30px] border border-white/60 bg-[rgba(255,255,255,0.5)] p-5 shadow-sm"
        >
          <div className="animate-pulse space-y-4">
            <div className="h-6 w-28 rounded-full bg-white/70" />
            <div className="h-8 w-3/4 rounded-2xl bg-white/70" />
            <div className="h-20 rounded-3xl bg-white/60" />
            <div className="flex items-end justify-between">
              <div className="h-10 w-28 rounded-2xl bg-white/70" />
              <div className="h-11 w-32 rounded-2xl bg-white/70" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function CartSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="rounded-[28px] border border-white/60 bg-[rgba(255,255,255,0.52)] p-5 shadow-sm"
        >
          <div className="animate-pulse space-y-4">
            <div className="h-7 w-1/3 rounded-2xl bg-white/70" />
            <div className="h-5 w-1/4 rounded-2xl bg-white/60" />
            <div className="h-12 w-full rounded-3xl bg-white/60" />
          </div>
        </div>
      ))}
    </div>
  );
}
