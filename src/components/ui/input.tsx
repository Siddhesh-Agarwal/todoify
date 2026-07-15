import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 border border-border bg-input px-3 py-1 font-mono text-xs uppercase tracking-[0.05em] text-foreground outline-none transition-colors placeholder:text-muted-foreground placeholder:normal-case disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40",
        "focus-visible:border-foreground",
        "aria-invalid:border-accent aria-invalid:text-accent",
        className
      )}
      {...props}
    />
  )
}

export { Input }
