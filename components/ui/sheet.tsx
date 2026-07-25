"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function Sheet({
  ...props
}: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="sheet" {...props} />
}

function SheetContent({
  className,
  children,
  side = "left",
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  side?: "left" | "right"
  showCloseButton?: boolean
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 transition-opacity duration-200" />
      <DialogPrimitive.Viewport
        className={cn(
          "fixed inset-0 z-50 flex p-0",
          side === "left" ? "justify-start" : "justify-end"
        )}
      >
        <DialogPrimitive.Popup
          data-slot="sheet-content"
          className={cn(
            "relative flex h-full w-full max-w-sm flex-col border-border bg-background shadow-xl outline-none data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 transition-all duration-200",
            side === "left"
              ? "border-r data-[ending-style]:-translate-x-full data-[starting-style]:-translate-x-full"
              : "border-l data-[ending-style]:translate-x-full data-[starting-style]:translate-x-full",
            className
          )}
          {...props}
        >
          {children}
          {showCloseButton ? (
            <DialogPrimitive.Close className="absolute top-3 right-3 inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <XIcon className="size-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          ) : null}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Viewport>
    </DialogPrimitive.Portal>
  )
}

export { Sheet, SheetContent }
