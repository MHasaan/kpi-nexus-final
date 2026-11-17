/**
 * 2.3: assigning a PER_UNIT KPI to a parent unit cascades it to the children.
 * `POST /org-units/:id/kpis` has always done that; creating the KPI with
 * `orgUnitIds` wrote the direct rows and skipped the cascade, so the same
 * assignment behaved differently depending on how it was made.
 */
import { beforeAll, describe, expect, test } from 'vitest';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

async function isApiUp(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function http<T = unknown>(url: string, init: RequestInit & { token?: string } = {}): Promise<{ status: number; body: T | null }> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && init.body !== null) headers.set('content-type', 'application/json');
  if (init.token) headers.set('authorization', `Bearer ${init.token}`);
  const res = await fetch(`${API_URL}${url}`, { ...init, headers });
  let body: T | null = null;
  try {
    body = (await res.json()) as T;
  } catch {
    /* no body */
  }
  return { status: res.status, body };
}

const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let apiAvailable = false;
beforeAll(async () => {
  apiAvailable = await isApiUp();
});

describe('PER_UNIT assignment cascades however it was made', () => {
  test('creating the KPI with orgUnitIds cascades to child units', async () => {
    if (!apiAvailable) return;
    const stamp = suffix();
    const reg = await http<{ accessToken: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        orgName: `Inherit ${stamp}`,
        slug: `inherit-${stamp}`,
        adminEmail: `admin-${stamp}@inherit.test.local`,
        adminPassword: 'correct-horse-battery-staple',
        adminFullName: 'Inherit Admin',
      }),
    });
    expect(reg.status).toBe(201);
    const token = reg.body!.accessToken;

    const parent = await http<{ id: string }>('/org-units', {
      method: 'POST',
      token,
      body: JSON.stringify({ name: `Engineering ${stamp}` }),
    });
    expect(parent.status).toBe(201);
    const child = await http<{ id: string }>('/org-units', {
      method: 'POST',
      token,
      body: JSON.stringify({ name: `Platform ${stamp}`, parentUnitId: parent.body!.id }),
    });
    expect(child.status).toBe(201);

    // Assign at creation, to the parent only.
    const kpi = await http<{ id: string }>('/kpis', {
      method: 'POST',
      token,
      body: JSON.stringify({
        name: `Lead Time ${stamp}`,
        scope: 'PER_UNIT',
        type: 'NUMBER',
        direction: 'LOWER_IS_BETTER',
        aggregationMethod: 'LAST',
        orgUnitIds: [parent.body!.id],
      }),
    });
    expect(kpi.status).toBe(201);

    // The parent holds it directly; the child inherits it.
    type UnitKpi = { kpiId: string; inherited: boolean; inheritedFromUnitId: string | null };
    const parentList = await http<UnitKpi[]>(`/org-units/${parent.body!.id}/kpis`, { token });
    expect(parentList.status).toBe(200);
    const onParent = parentList.body!.find((r) => r.kpiId === kpi.body!.id);
    expect(onParent, 'the parent holds the KPI').toBeDefined();
    expect(onParent!.inherited).toBe(false);

    const childList = await http<UnitKpi[]>(`/org-units/${child.body!.id}/kpis`, { token });
    expect(childList.status).toBe(200);
    const onChild = childList.body!.find((r) => r.kpiId === kpi.body!.id);
    expect(onChild, 'the child inherits the KPI from its parent').toBeDefined();
    expect(onChild!.inherited).toBe(true);
    expect(onChild!.inheritedFromUnitId).toBe(parent.body!.id);
  });
});
