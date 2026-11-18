import { ApiError } from './api-client';

/**
 * A list a page can do without — the KPIs behind a picker, say. If it fails to
 * load, the page carries on with an empty list, but is told so: an empty picker
 * with no word of why reads as "there are none".
 */
export async function optionalList<T>(list: Promise<T[]>, what: string, failed: (message: string) => void): Promise<T[]> {
  try {
    return await list;
  } catch (err) {
    failed(err instanceof ApiError && err.message ? `${what} could not be loaded: ${err.message}` : `${what} could not be loaded.`);
    return [];
  }
}
