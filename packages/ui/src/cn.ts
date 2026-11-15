import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind class names with conflict resolution.
 *
 * Use everywhere class names are conditionally composed — the twMerge step
 * resolves utility collisions like `px-2 px-4` so the latest wins.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
