'use client';

interface PrintButtonProps {
  label?: string;
  className?: string;
}

export function PrintButton({
  label = 'Print',
  className,
}: PrintButtonProps) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      data-testid="print-button"
      className={
        className ??
        'no-print rounded-md border border-border bg-surface-1 px-3 py-1.5 text-sm text-content-default hover:bg-surface-2'
      }
    >
      {label}
    </button>
  );
}
