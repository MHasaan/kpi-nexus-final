/** "just now", "5 minutes ago", "3 hours ago", "yesterday", "4 days ago", then the date — written by `formatDate` (the organisation's formatter, where there is one). */
export function timeAgo(iso: string, now: Date = new Date(), formatDate: (value: Date) => string = (value) => value.toLocaleDateString()): string {
  const then = new Date(iso);
  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
  if (!Number.isFinite(seconds)) return '';
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return formatDate(then);
}
