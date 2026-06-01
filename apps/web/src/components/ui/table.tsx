import { forwardRef, type HTMLAttributes, type TdHTMLAttributes, type ThHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export const Table = forwardRef<HTMLTableElement, HTMLAttributes<HTMLTableElement>>(function Table(
  { className, ...rest },
  ref,
) {
  return (
    <div className="w-full overflow-x-auto">
      <table ref={ref} className={cn('w-full border-collapse text-sm', className)} {...rest} />
    </div>
  );
});

export interface TableHeaderProps extends HTMLAttributes<HTMLTableSectionElement> {
  /** Keep the header visible while the body scrolls. */
  sticky?: boolean;
}

export const TableHeader = forwardRef<HTMLTableSectionElement, TableHeaderProps>(function TableHeader(
  { className, sticky, ...rest },
  ref,
) {
  return (
    <thead
      ref={ref}
      className={cn('border-b border-border bg-surface-1', sticky && 'sticky top-0 z-10', className)}
      {...rest}
    />
  );
});

export interface TableBodyProps extends HTMLAttributes<HTMLTableSectionElement> {
  /** Apply alternating row backgrounds. */
  zebra?: boolean;
}

export const TableBody = forwardRef<HTMLTableSectionElement, TableBodyProps>(function TableBody(
  { className, zebra, ...rest },
  ref,
) {
  return (
    <tbody
      ref={ref}
      className={cn(zebra && '[&_tr:nth-child(even)]:bg-surface-1', className)}
      {...rest}
    />
  );
});

export const TableRow = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(function TableRow(
  { className, ...rest },
  ref,
) {
  return (
    <tr
      ref={ref}
      className={cn('border-b border-border-divider transition-colors last:border-0 hover:bg-surface-hover', className)}
      {...rest}
    />
  );
});

export const TableHead = forwardRef<HTMLTableCellElement, ThHTMLAttributes<HTMLTableCellElement>>(function TableHead(
  { className, ...rest },
  ref,
) {
  return (
    <th
      ref={ref}
      scope="col"
      className={cn(
        'h-9 px-3 text-left align-middle text-xs font-semibold uppercase tracking-wide text-content-muted',
        className,
      )}
      {...rest}
    />
  );
});

export const TableCell = forwardRef<HTMLTableCellElement, TdHTMLAttributes<HTMLTableCellElement>>(function TableCell(
  { className, ...rest },
  ref,
) {
  return <td ref={ref} className={cn('px-3 py-3 align-middle text-content-strong', className)} {...rest} />;
});
