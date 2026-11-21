/**
 * Manual QA (2026-11-19, F-057): the audit page offered IMPERSONATE, INVITE, PERMISSION_CHANGE, CONFIG_CHANGE,
 * BILLING_EVENT and SYSTEM_EVENT, none of which the log records, and each gave "Internal server error"; the
 * actions it does record (IMPORT, APPROVE, REJECT, IMPERSONATE_START/END) could not be chosen. The actions the
 * log records are listed once, in contracts, and the API refuses any other value with a 400.
 */
import { BadRequestException } from '@nestjs/common';
import { describe, expect, test, vi } from 'vitest';

import { AuditAction } from '@kpi-nexus/db';
import { AUDIT_ACTIONS } from '@kpi-nexus/contracts';

import { AuditController } from './audit.controller.js';
import type { AuditService } from './audit.service.js';

describe('the audit actions the page offers', () => {
  test('are exactly the ones the log records', () => {
    expect([...AUDIT_ACTIONS].sort()).toEqual(Object.values(AuditAction).sort());
  });
});

describe('GET /audit?action=', () => {
  const make = () => {
    const service = { list: vi.fn(async () => []), exportCsv: vi.fn(async () => '') };
    return { service, controller: new AuditController(service as unknown as AuditService) };
  };

  test('an action the log never records is refused with a 400 that names the choices', async () => {
    const { controller, service } = make();
    const err = await Promise.resolve()
      .then(() => controller.list(undefined, undefined, undefined, 'INVITE'))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).getResponse()).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(String((err as BadRequestException).getResponse() && JSON.stringify((err as BadRequestException).getResponse()))).toContain('APPROVE');
    expect(service.list).not.toHaveBeenCalled();
  });

  test('a recorded action is passed on to the log', async () => {
    const { controller, service } = make();
    await controller.list(undefined, undefined, undefined, 'APPROVE');
    expect(service.list).toHaveBeenCalledWith(expect.objectContaining({ action: 'APPROVE' }));
  });
});
