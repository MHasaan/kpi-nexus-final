/**
 * What a KPI threshold band counts as. A band has a name, a range and a colour;
 * the status it gives the KPI is read off its **name**. The API's health rule and
 * the band form share this one function, so the form can say what a band will
 * count as before it is saved.
 */
export type BandMeaning = 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK';

export function bandMeaning(name: string): BandMeaning {
  const n = name.toLowerCase();
  if (/off|crit|red|behind|fail/.test(n)) return 'OFF_TRACK';
  if (/risk|warn|amber|watch/.test(n)) return 'AT_RISK';
  return 'ON_TRACK';
}

/** The three bands the form offers ready-made: a name that means what it says, and its usual colour. */
export const BAND_PRESETS: ReadonlyArray<{ meaning: BandMeaning; name: string; color: string }> = [
  { meaning: 'ON_TRACK', name: 'On track', color: '#16a34a' },
  { meaning: 'AT_RISK', name: 'At risk', color: '#d97706' },
  { meaning: 'OFF_TRACK', name: 'Off track', color: '#dc2626' },
];
