import Link from "next/link";
import { Boxes } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <Boxes className="size-6" />
      </div>
      <p className="text-5xl font-bold tracking-tight">404</p>
      <p className="max-w-sm text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/dashboard"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
