import * as React from "react";
import { cn } from "@/lib/utils";

/** Shared styles for native &lt;select&gt; (avoids Radix Select portal + Dialog removeChild bugs). */
export const nativeSelectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(nativeSelectClassName, className)} {...props} />;
}
