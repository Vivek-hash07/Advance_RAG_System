"use client"

import { useState } from "react"
import { ChevronDownIcon, SparklesIcon } from "lucide-react"

import type { OptimizedQuery } from "@/components/dashboard/types"
import { cn } from "@/lib/utils"

function Row({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null

  return (
    <div className="grid gap-0.5">
      <dt className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="text-xs leading-relaxed text-foreground/80">{value}</dd>
    </div>
  )
}

/**
 * Shows how the question was expanded before retrieval — the step-back
 * question, the rewrite, the sub-questions and the HyDE passage.
 */
export function QueryInsight({ queries }: { queries: OptimizedQuery }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <SparklesIcon className="size-3" />
        How this was searched
        <ChevronDownIcon
          className={cn("size-3 transition-transform", isOpen && "rotate-180")}
        />
      </button>

      {isOpen ? (
        <dl className="mt-2 grid gap-2.5 rounded-lg border border-border bg-muted/30 p-3">
          <Row label="Rewritten" value={queries.rewritten} />
          <Row label="Step-back question" value={queries.stepBack} />
          {queries.subQueries.length > 0 ? (
            <div className="grid gap-0.5">
              <dt className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                Sub-questions
              </dt>
              <dd>
                <ul className="list-inside list-decimal text-xs leading-relaxed text-foreground/80">
                  {queries.subQueries.map((subQuery) => (
                    <li key={subQuery}>{subQuery}</li>
                  ))}
                </ul>
              </dd>
            </div>
          ) : null}
          <Row label="HyDE passage" value={queries.hyde} />
        </dl>
      ) : null}
    </div>
  )
}
