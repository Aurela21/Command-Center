"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

type Crumb = { label: string; href?: string };

export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav className="flex items-center gap-1.5 text-xs mb-4">
      {crumbs.map((crumb, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="h-3 w-3 text-[#52525b]" />}
          {crumb.href ? (
            <Link
              href={crumb.href}
              className="text-[#71717a] hover:text-[#a1a1aa] transition-colors"
            >
              {crumb.label}
            </Link>
          ) : (
            <span className="text-[#a1a1aa]">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
