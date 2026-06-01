import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names with clsx (conditional/array support) and tailwind-merge
 * (later Tailwind utilities win over conflicting earlier ones).
 */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
