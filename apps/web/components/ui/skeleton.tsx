import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md border border-white/[0.04] bg-white/[0.04]",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
