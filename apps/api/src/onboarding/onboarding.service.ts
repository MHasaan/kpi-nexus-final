import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { AuthService } from '../auth/auth.service.js';
import { OrgTemplatesService } from '../org-templates/org-templates.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { deriveDraftToken, hashDraftToken, mergeDraft, verifyDraftToken } from './draft-token.js';
import { type TemplatePayload, validateTemplatePayload } from '../org-templates/template-payload.js';

const DRAFT_SECRET = process.env.ONBOARDING_DRAFT_SECRET ?? process.env.JWT_SECRET ?? 'dev-onboarding-secret';
const VALID_SIZE_TIERS = new Set(['SMALL', 'MEDIUM', 'LARGE', 'ENTERPRISE']);

function mapTrack(track: string): 'IC' | 'MANAGEMENT' | 'EXECUTIVE' {
  if (track === 'INDIVIDUAL_CONTRIBUTOR' || track === 'IC') return 'IC';
  if (track === 'EXECUTIVE') return 'EXECUTIVE';
  return 'MANAGEMENT';
}

export interface CompleteBody {
  adminEmail: string;
  adminPassword: string;
  adminFullName: string;
  slug: string;
}

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly templates: OrgTemplatesService,
  ) {}

  /** Begin an onboarding session. Returns the resumable draft token. */
  async start(input: { email: string; organizationName: string; entryMode?: string }) {
    return RequestContextStore.runWithBypass('onboarding.start', async () => {
      const session = await this.prisma.onboardingSession.create({
        data: {
          organizationName: input.organizationName,
          userEmail: input.email,
          entryMode: input.entryMode ?? 'full',
          payload: { organization: { name: input.organizationName } } as unknown as object,
        },
      });
      const draftToken = deriveDraftToken(session.id, DRAFT_SECRET);
      await this.prisma.onboardingSession.update({
        where: { id: session.id },
        data: { draftTokenHash: hashDraftToken(draftToken) },
      });
      return { sessionId: session.id, draftToken };
    });
  }

  private async loadVerified(sessionId: string, token: string) {
    return RequestContextStore.runWithBypass('onboarding.load', async () => {
      const session = await this.prisma.onboardingSession.findUnique({ where: { id: sessionId } });
      if (!session) throw new NotFoundException({ code: 'ONBOARDING_NOT_FOUND', message: 'Session not found' });
      if (!verifyDraftToken(token, session.draftTokenHash)) {
        throw new ForbiddenException({ code: 'INVALID_DRAFT_TOKEN', message: 'Invalid draft token' });
      }
      return session;
    });
  }

  async getDraft(sessionId: string, token: string) {
    const session = await this.loadVerified(sessionId, token);
    return { sessionId, status: session.status, lastEditedStep: session.lastEditedStep, payload: session.payload };
  }

  async patchDraft(sessionId: string, token: string, patch: Record<string, unknown>, lastEditedStep?: string) {
    const session = await this.loadVerified(sessionId, token);
    if (session.status !== 'in_progress') {
      throw new BadRequestException({ code: 'ONBOARDING_NOT_EDITABLE', message: 'Session is not editable' });
    }
    const merged = mergeDraft(session.payload as Record<string, unknown>, patch);
    return RequestContextStore.runWithBypass('onboarding.patch', async () => {
      const updated = await this.prisma.onboardingSession.update({
        where: { id: sessionId },
        data: { payload: merged as unknown as object, lastEditedStep: lastEditedStep ?? session.lastEditedStep },
      });
      return { sessionId, payload: updated.payload };
    });
  }

  /** Merge a template's payload into the draft (doesn't blow away existing). */
  async applyTemplate(sessionId: string, token: string, slug: string) {
    await this.loadVerified(sessionId, token);
    const template = await this.templates.preview(slug);
    return this.patchDraft(sessionId, token, template.payload as unknown as Record<string, unknown>, 'template');
  }

  /**
   * Materialize the draft into a real org in one atomic transaction: org +
   * roles + admin user + positions + unit hierarchy + categories + KPIs. Issues
   * a JWT pair. Rolls back entirely on any failure.
   */
  async complete(sessionId: string, token: string, body: CompleteBody) {
    const session = await this.loadVerified(sessionId, token);
    if (session.status === 'completed') {
      throw new BadRequestException({ code: 'ONBOARDING_DONE', message: 'Session already completed' });
    }
    const payload = session.payload as unknown as TemplatePayload;
    const problems = validateTemplatePayload(payload);
    if (problems.length > 0) {
      throw new BadRequestException({ code: 'ONBOARDING_INVALID', message: 'Draft is incomplete', details: problems });
    }

    const passwordHash = await bcrypt.hash(body.adminPassword, 12);
    const sizeTier = payload.organization.sizeTier && VALID_SIZE_TIERS.has(payload.organization.sizeTier)
      ? payload.organization.sizeTier
      : null;

    const result = await RequestContextStore.runWithBypass('onboarding.complete', async () => {
      const slugTaken = await this.prisma.organization.findUnique({ where: { slug: body.slug } });
      if (slugTaken) throw new ConflictException({ code: 'CONFLICT', message: 'slug already in use' });

      return this.prisma.$transaction(async (tx) => {
        const org = await tx.organization.create({
          data: {
            name: payload.organization.name,
            slug: body.slug,
            industry: payload.organization.industry ?? null,
            type: payload.organization.type ?? null,
            ...(sizeTier ? { sizeTier: sizeTier as 'SMALL' | 'MEDIUM' | 'LARGE' | 'ENTERPRISE' } : {}),
          },
        });

        await tx.roleDefinition.createMany({
          data: payload.roles.map((r) => ({
            organizationId: org.id,
            name: r.name,
            permissions: r.permissions,
            isAdmin: r.isAdmin,
            level: r.level,
            color: r.color ?? null,
          })),
        });
        const adminRole = await tx.roleDefinition.findFirstOrThrow({
          where: { organizationId: org.id, isAdmin: true },
        });

        const adminUser = await tx.user.create({
          data: {
            organizationId: org.id,
            email: body.adminEmail,
            fullName: body.adminFullName,
            passwordHash,
            roleId: adminRole.id,
            status: 'ACTIVE',
            emailVerifiedAt: new Date(),
          },
        });

        if (payload.positions.length) {
          await tx.position.createMany({
            data: payload.positions.map((p) => ({ organizationId: org.id, name: p.name, track: mapTrack(p.track) })),
          });
        }

        const dimension = await tx.orgUnitDimension.create({
          data: { organizationId: org.id, name: 'Departments', isDefault: true },
        });
        const typeMap = new Map<string, string>();
        for (const t of payload.orgUnitTypes) {
          const created = await tx.orgUnitType.create({
            data: { organizationId: org.id, dimensionId: dimension.id, name: t.name, namePlural: `${t.name}s`, allowNesting: true },
          });
          typeMap.set(t.name, created.id);
        }

        // Create units parent-before-child regardless of array order.
        const unitMap = new Map<string, string>();
        const remaining = [...payload.orgUnits];
        let guard = remaining.length * remaining.length + 1;
        while (remaining.length > 0 && guard-- > 0) {
          const next = remaining.findIndex((u) => !u.parent || unitMap.has(u.parent));
          if (next === -1) break; // unresolved parent (validator should prevent)
          const u = remaining.splice(next, 1)[0]!;
          const created = await tx.orgUnit.create({
            data: {
              organizationId: org.id,
              orgUnitTypeId: typeMap.get(u.type)!,
              parentUnitId: u.parent ? (unitMap.get(u.parent) ?? null) : null,
              name: u.name,
              code: u.code ?? null,
            },
          });
          unitMap.set(u.name, created.id);
        }

        const catMap = new Map<string, string>();
        for (let i = 0; i < payload.kpiCategories.length; i += 1) {
          const c = payload.kpiCategories[i]!;
          const created = await tx.kPICategory.create({
            data: { organizationId: org.id, name: c.name, color: c.color ?? null, sortOrder: i },
          });
          catMap.set(c.name, created.id);
        }

        if (payload.kpis.length) {
          await tx.kPI.createMany({
            data: payload.kpis.map((k) => ({
              organizationId: org.id,
              name: k.name,
              description: k.description ?? null,
              categoryId: catMap.get(k.category) ?? null,
              scope: k.scope,
              type: k.type,
              direction: k.direction,
              frequency: k.frequency,
              unit: k.unit ?? null,
              scorecardQuadrant: k.scorecardQuadrant ?? null,
              createdById: adminUser.id,
              status: 'DRAFT',
            })),
          });
        }

        await tx.onboardingSession.update({
          where: { id: sessionId },
          data: { status: 'completed', completedAt: new Date(), organizationId: org.id, userId: adminUser.id },
        });

        return { org, adminUser, adminRole };
      });
    });

    const pair = await this.auth.issueTokensForUser({
      userId: result.adminUser.id,
      organizationId: result.org.id,
      roleId: result.adminRole.id,
      isAdmin: true,
    });

    return {
      ...pair,
      organization: { id: result.org.id, name: result.org.name, slug: result.org.slug },
      user: { id: result.adminUser.id, email: result.adminUser.email },
    };
  }
}
