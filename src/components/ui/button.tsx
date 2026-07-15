import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 font-mono uppercase tracking-[0.08em] text-xs font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[2px] focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-foreground text-background border border-foreground hover:bg-transparent hover:text-foreground",
        destructive:
          "bg-accent text-foreground border border-accent hover:bg-transparent hover:text-accent focus-visible:ring-accent",
        outline:
          "border border-border bg-transparent text-foreground hover:border-foreground hover:bg-secondary",
        secondary:
          "bg-secondary text-secondary-foreground border border-border hover:border-foreground",
        ghost:
          "border border-transparent bg-transparent text-foreground hover:bg-secondary hover:text-foreground",
        link: "text-foreground underline-offset-4 hover:underline border-0",
      },
      size: {
        default: "h-9 px-4",
        xs: "h-6 px-2 text-[10px]",
        sm: "h-8 px-3",
        lg: "h-10 px-6",
        icon: "size-9",
        "icon-xs": "size-6",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
