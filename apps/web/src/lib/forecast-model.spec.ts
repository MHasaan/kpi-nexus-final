import { describe, expect, test } from 'vitest';

import { forecastFallbackNotice, forecastModelLabel } from './forecast-model';

describe('forecast model', () => {
  test('models are named in words, whatever case the API uses', () => {
    expect(forecastModelLabel('NAIVE')).toBe('Simple trend');
    expect(forecastModelLabel('prophet')).toBe('Prophet');
    expect(forecastModelLabel('ARIMA')).toBe('ARIMA');
    expect(forecastModelLabel('LSTM')).toBe('LSTM'); // one this page does not offer is shown as it is
  });

  test('nothing to say when the chosen model ran', () => {
    expect(forecastFallbackNotice('prophet', 'PROPHET')).toBeNull();
    expect(forecastFallbackNotice('naive', 'NAIVE')).toBeNull();
  });

  test('says which model was asked for, that it could not run, and which one did (QA-M9)', () => {
    expect(forecastFallbackNotice('prophet', 'NAIVE')).toBe(
      "Prophet could not be fitted to this KPI's values — usually because there are too few of them or they are unevenly spaced. This forecast was made with Simple trend instead.",
    );
    expect(forecastFallbackNotice('arima', 'NAIVE')).toContain('ARIMA could not be fitted');
  });
});
