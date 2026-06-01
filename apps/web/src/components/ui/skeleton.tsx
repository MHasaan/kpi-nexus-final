import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type SkeletonProps = HTMLAttributes<HTMLDivElement>;

/** Pulsing placeholder block for loading states. */
export function Skeleton({ className, ...rest }: SkeletonProps) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-surface-2', className)} {...rest} />;
}
