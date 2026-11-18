const FORMAT_EXT: Record<string, string> = {
  CSV: 'csv',
  EXCEL: 'xlsx',
  PDF: 'pdf',
};

/** Where a report run's file is kept in storage. One rule for writing it and for finding it again. */
export function reportFileKey(organizationId: string, runId: string, format: string): string {
  return `reports/${organizationId}/${runId}.${FORMAT_EXT[format] ?? 'bin'}`;
}
