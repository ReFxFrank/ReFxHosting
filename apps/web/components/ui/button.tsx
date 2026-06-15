import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium tracking-tight transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border border-[rgba(120,185,255,0.45)] bg-[linear-gradient(180deg,rgba(40,140,255,1),rgba(0,114,255,1))] text-primary-foreground shadow-[0_1px_0_rgba(255,255,255,0.22)_inset,0_8px_22px_-12px_rgba(0,114,255,0.65)] hover:brightness-110 hover:shadow-[0_1px_0_rgba(255,255,255,0.28)_inset,0_10px_28px_-10px_rgba(0,114,255,0.8)]",
        destructive:
          "border border-destructive/50 bg-destructive text-destructive-foreground shadow-[0_8px_22px_-14px_rgba(0,0,0,0.7)] hover:brightness-110",
        outline:
          "border border-white/10 bg-white/[0.03] text-foreground shadow-[0_1px_0_rgba(255,255,255,0.03)_inset] hover:border-primary/40 hover:bg-primary/10 hover:text-foreground",
        secondary:
          "border border-white/10 bg-white/[0.04] text-secondary-foreground shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] hover:border-primary/30 hover:bg-white/[0.07]",
        ghost: "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline hover:text-[hsl(214_100%_75%)]",
        success:
          "border border-success/50 bg-success text-success-foreground shadow-[0_8px_22px_-14px_rgba(0,0,0,0.7)] hover:brightness-110",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-11 rounded-md px-8",
        icon: "h-9 w-9",
        "icon-sm": "h-8 w-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="animate-spin" />
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
