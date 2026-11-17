import type { ReactNode } from 'react';

/** A titled, counted list of what one draft section holds, by name. */
export function SectionList({
  title,
  items,
  empty,
  children,
}: {
  title: string;
  items: ReadonlyArray<{ name?: string; email?: string }>;
  /** Said when the section holds nothing. */
  empty: string;
  /** Extra detail under the list. */
  children?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface-1 p-4">
      <h2 className="text-sm font-semibold text-content-strong">
        {title} <span className="font-normal text-content-muted">({items.length})</span>
      </h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-content-muted">{empty}</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {items.map((item, index) => (
            <li key={index} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-content-strong">
              {(item.name ?? item.email ?? '').trim() || <span className="italic text-content-muted">unnamed</span>}
            </li>
          ))}
        </ul>
      )}
      {children}
    </section>
  );
}
