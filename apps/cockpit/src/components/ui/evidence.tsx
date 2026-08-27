/**
 * A calm, minimal evidence list. Muted text, a neutral hairline bullet (not a status marker),
 * and a quiet label - so a wall of findings reads as scannable notes rather than shouting.
 */
export function EvidenceList({ items, columns = 2 }: { items: string[]; columns?: 1 | 2 }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Evidence</div>
      <ul className={`grid gap-x-6 gap-y-2 ${columns === 2 ? "sm:grid-cols-2" : ""}`}>
        {items.map((e, i) => (
          <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-muted-foreground">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
            <span>{e}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
