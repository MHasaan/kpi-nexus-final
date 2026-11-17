import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_ROLES,
  type DraftTeamMember,
  type OnboardingDraft,
  OnboardingDraftPatchSchema,
  draftShapeProblems,
  normalizeSizeTier,
  validateOnboardingDraft,
} from '@kpi-nexus/contracts';
import * as bcrypt from 'bcrypt';

import { AuditService } from '../audit/audit.service.js';
import { AuthService } from '../auth/auth.service.js';
import { EmailService } from '../email/email.service.js';
import { webAppUrl } from '../email/web-app-url.js';
import { computeInheritedAssignments } from '../org-unit-kpis/inheritance.js';
import { OrgTemplatesService } from '../org-templates/org-templates.service.js';
import { DEFAULT_PASSWORD_POLICY, checkPasswordPolicy } from '../password/password-policy.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { UsersService } from '../users/users.service.js';
import { deriveDraftToken, hashDraftToken, mergeDraft, verifyDraftToken } from './draft-token.js';
import { ONBOARDING_DRAFT_SPEC, resolveSecret } from '../config/secrets.js';

// Resolved lazily: a module-level constant is evaluated before ConfigModule has
// loaded .env, so it silently ignored ONBOARDING_DRAFT_SECRET / JWT_SECRET from
// .env and used the public dev default. Dev default refused in production (OT-008).
const draftSecret = (): string => resolveSecret(ONBOARDING_DRAFT_SPEC);

function mapTrack(track: string): 'IC' | 'MANAGEMENT' | 'EXECUTIVE' {
  if (track === 'INDIVIDUAL_CONTRIBUTOR' || track === 'IC') return 'IC';
  if (track === 'EXECUTIVE') return 'EXECUTIVE';
  return 'MANAGEMENT';
}

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

/** How a name is matched when one row refers to another: no case, no outer spaces. */
const nameKey = (value: string): string => value.trim().toLowerCase();

/**
 * A template describes a sample organisation ("Acme SaaS"); the person setting
 * up has their own. What they have already said about theirs — above all its
 * name — is kept, and the template only fills in what they have not said.
 */
export function keepOwnOrganization(
  own: Record<string, unknown> | null | undefined,
  fromTemplate: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const said = Object.fromEntries(
    Object.entries(own ?? {}).filter(([, value]) => value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === '')),
  );
  return { ...(fromTemplate ?? {}), ...said };
}

/** What happened to one person the wizard was asked to invite. */
export interface OnboardingInvite {
  email: string;
  invited: boolean;
  /** Whether the invitation email was handed to the mail server. */
  emailSent?: boolean;
  /** Plaintext token — only outside production, like POST /users. */
  inviteToken?: string;
  /** Why they could not be invited, when they could not. */
  error?: string;
}

/**
 * People in an order where everyone comes after whoever they report to, so a
 * manager exists by the time their report is invited. The draft is validated
 * first, so there are no loops; anyone left over (there should be nobody) is
 * appended rather than dropped.
 */
export function managersFirst(team: readonly DraftTeamMember[]): DraftTeamMember[] {
  const inTeam = new Set(team.map((p) => nameKey(p.email)));
  const placed = new Set<string>();
  const ordered: DraftTeamMember[] = [];
  let remaining = [...team];
  while (remaining.length > 0) {
    const ready = remaining.filter((p) => {
      const manager = p.manager ? nameKey(p.manager) : '';
      return !manager || !inTeam.has(manager) || placed.has(manager);
    });
    if (ready.length === 0) break;
    for (const p of ready) {
      ordered.push(p);
      placed.add(nameKey(p.email));
    }
    remaining = remaining.filter((p) => !placed.has(nameKey(p.email)));
  }
  return [...ordered, ...remaining];
}

export interface CompleteBody {
  adminEmail: string;
  adminPassword: string;
  adminFullName: string;
  slug: string;
}

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly templates: OrgTemplatesService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
  ) {}

  /** Begin an onboarding session. Returns the resumable draft token. */
  async start(input: { email: string; organizationName: string; entryMode?: string }) {
    return RequestContextStore.runWithBypass('onboarding.start', async () => {
      const session = await this.prisma.onboardingSession.create({
        data: {
          organizationName: input.organizationName,
          userEmail: input.email,
          entryMode: input.entryMode ?? 'full',
          payload: {
            organization: { name: input.organizationName },
            // A quick start is "name it and go": it begins with the four roles a
            // plain registration creates, so it can be finished as it stands. A
            // full setup begins empty and builds its own (plan 3.7).
            ...(input.entryMode === 'quick'
              ? {
                  roles: DEFAULT_ROLES.map((r) => ({
                    name: r.name,
                    isAdmin: r.isAdmin,
                    level: r.level,
                    color: r.color,
                    permissions: [...r.permissions],
                  })),
                }
              : {}),
          } as unknown as object,
        },
      });
      const draftToken = deriveDraftToken(session.id, draftSecret());
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
    // Every writer — the wizard, a template, the AI — goes through here, so this
    // is where a draft gets its shape (plan 3.1). Before this the endpoint took
    // any JSON, and a section of the wrong type failed `complete` with a 500.
    const parsed = OnboardingDraftPatchSchema.safeParse(patch);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'ONBOARDING_INVALID_DRAFT',
        message: 'That is not a valid onboarding draft',
        details: { problems: draftShapeProblems(parsed.error.issues) },
      });
    }
    const merged = mergeDraft(session.payload as Record<string, unknown>, parsed.data);
    return RequestContextStore.runWithBypass('onboarding.patch', async () => {
      const updated = await this.prisma.onboardingSession.update({
        where: { id: sessionId },
        data: { payload: merged as unknown as object, lastEditedStep: lastEditedStep ?? session.lastEditedStep },
      });
      return { sessionId, payload: updated.payload };
    });
  }

  /** What stops the draft becoming an organisation. The wizard shows this on its last step. */
  async validateDraft(sessionId: string, token: string) {
    const session = await this.loadVerified(sessionId, token);
    // The address sign-up started with is the administrator's unless they change
    // it on the last step: it may be named as a manager, and is not invited.
    return { problems: validateOnboardingDraft(session.payload, { adminEmail: session.userEmail ?? undefined }) };
  }

  /** Merge a template's payload into the draft (doesn't blow away existing). */
  async applyTemplate(sessionId: string, token: string, slug: string) {
    const session = await this.loadVerified(sessionId, token);
    const template = await this.templates.preview(slug);
    return this.patchDraft(
      sessionId,
      token,
      {
        ...(template.payload as unknown as Record<string, unknown>),
        organization: keepOwnOrganization(
          (session.payload as { organization?: Record<string, unknown> } | null)?.organization,
          template.payload.organization as unknown as Record<string, unknown>,
        ),
      },
      'template',
    );
  }

  /**
   * System maintenance: archive all in_progress onboarding sessions that have
   * not been updated for `olderThanDays` days.  Runs cross-tenant (no org
   * filter) because it is called from a scheduled BullMQ job, not from an HTTP
   * request — there is no RequestContext here by design.
   *
   * Returns the number of sessions archived.
   */
  async cleanupStale(olderThanDays = 30): Promise<{ cleaned: number }> {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    const result = await RequestContextStore.runWithBypass('onboarding-cleanup', () =>
      this.prisma.onboardingSession.updateMany({
        where: {
          status: 'in_progress',
          updatedAt: { lt: cutoff },
        },
        data: { status: 'archived' },
      }),
    );
    return { cleaned: result.count };
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
    const problems = validateOnboardingDraft(session.payload, { adminEmail: body.adminEmail });
    if (problems.length > 0) {
      throw new BadRequestException({ code: 'ONBOARDING_INVALID', message: 'Draft is incomplete', details: { problems } });
    }
    // No problems ⇒ it parses; parsing fills the defaults a half-specified row relies on.
    const draft: OnboardingDraft = OnboardingDraftPatchSchema.parse(session.payload);
    const payload = {
      organization: { ...draft.organization, name: draft.organization!.name!.trim() },
      roles: draft.roles ?? [],
      positions: draft.positions ?? [],
      orgUnitTypes: draft.orgUnitTypes ?? [],
      orgUnits: draft.orgUnits ?? [],
      kpiCategories: draft.kpiCategories ?? [],
      kpis: draft.kpis ?? [],
      team: draft.team ?? [],
    };

    // A new organisation has no policy of its own yet, so the default one
    // applies — the same check an invitation or a password change gets.
    const violations = checkPasswordPolicy(body.adminPassword, DEFAULT_PASSWORD_POLICY);
    if (violations.length > 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Password does not meet policy',
        details: { violations },
      });
    }

    const passwordHash = await bcrypt.hash(body.adminPassword, 12);
    const orgDraft = payload.organization;
    const sizeTier = normalizeSizeTier(orgDraft.sizeTier);

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
            ...(sizeTier ? { sizeTier } : {}),
            // The organisation's own settings, when the wizard was told them (plan
            // 3.2a). Anything left out keeps the column default (UTC, USD, en-US…).
            ...(orgDraft.timezone ? { timezone: orgDraft.timezone } : {}),
            ...(orgDraft.currency ? { currency: orgDraft.currency.toUpperCase() } : {}),
            ...(orgDraft.locale ? { locale: orgDraft.locale } : {}),
            ...(orgDraft.weekStartsOn !== undefined ? { weekStartsOn: orgDraft.weekStartsOn } : {}),
            ...(orgDraft.fiscalYearStartMonth !== undefined
              ? { fiscalCalendar: { startMonth: orgDraft.fiscalYearStartMonth } }
              : {}),
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
          typeMap.set(nameKey(t.name), created.id);
        }

        // Create units parent-before-child regardless of array order.
        const unitMap = new Map<string, string>();
        const remaining = [...payload.orgUnits];
        let guard = remaining.length * remaining.length + 1;
        while (remaining.length > 0 && guard-- > 0) {
          const next = remaining.findIndex((u) => !u.parent?.trim() || unitMap.has(nameKey(u.parent)));
          if (next === -1) break; // unresolved parent (validator should prevent)
          const u = remaining.splice(next, 1)[0]!;
          const created = await tx.orgUnit.create({
            data: {
              organizationId: org.id,
              orgUnitTypeId: typeMap.get(nameKey(u.type))!,
              parentUnitId: u.parent?.trim() ? (unitMap.get(nameKey(u.parent)) ?? null) : null,
              name: u.name.trim(),
              code: u.code ?? null,
            },
          });
          unitMap.set(nameKey(u.name), created.id);
        }

        const catMap = new Map<string, string>();
        for (let i = 0; i < payload.kpiCategories.length; i += 1) {
          const c = payload.kpiCategories[i]!;
          const created = await tx.kPICategory.create({
            data: { organizationId: org.id, name: c.name, color: c.color ?? null, sortOrder: i },
          });
          catMap.set(nameKey(c.name), created.id);
        }

        // Units as a tree, for handing per-unit KPIs down it.
        const unitRows = await tx.orgUnit.findMany({
          where: { organizationId: org.id },
          select: { id: true, parentUnitId: true },
        });
        const topLevelUnitIds = unitRows.filter((u) => u.parentUnitId === null).map((u) => u.id);

        for (const k of payload.kpis) {
          const created = await tx.kPI.create({
            data: {
              organizationId: org.id,
              name: k.name.trim(),
              description: k.description ?? null,
              categoryId: catMap.get(nameKey(k.category)) ?? null,
              scope: k.scope,
              type: k.type,
              direction: k.direction,
              frequency: k.frequency,
              unit: k.unit ?? null,
              scorecardQuadrant: k.scorecardQuadrant ?? null,
              targetValue: k.targetValue ?? null,
              // Someone answers for every KPI from day one (plan 3.2b).
              ownerUserId: adminUser.id,
              createdById: adminUser.id,
              status: 'DRAFT',
            },
            select: { id: true },
          });
          if (k.scope !== 'PER_UNIT') continue;

          // A per-unit KPI belongs to units, or nobody could ever record it — the
          // state `POST /kpis` refuses, and the one onboarding used to leave
          // every per-unit KPI in. The units named hold it; with none named, the
          // top-level units do. Units below a holder inherit it.
          const named = (k.units ?? []).map((u) => unitMap.get(nameKey(u))).filter((id): id is string => Boolean(id));
          const direct = new Set(named.length > 0 ? named : topLevelUnitIds);
          const inherited = computeInheritedAssignments(unitRows, direct);
          await tx.kPIAssignmentOrgUnit.createMany({
            data: [
              ...[...direct].map((orgUnitId) => ({
                organizationId: org.id,
                kpiId: created.id,
                orgUnitId,
                inherited: false,
                targetValue: k.targetValue ?? null,
              })),
              ...inherited.map((row) => ({
                organizationId: org.id,
                kpiId: created.id,
                orgUnitId: row.unitId,
                inherited: true,
                inheritedFromUnitId: row.sourceUnitId,
              })),
            ],
          });
        }

        await tx.onboardingSession.update({
          where: { id: sessionId },
          data: { status: 'completed', completedAt: new Date(), organizationId: org.id, userId: adminUser.id },
        });

        const [roleRows, positionRows] = await Promise.all([
          tx.roleDefinition.findMany({ where: { organizationId: org.id }, select: { id: true, name: true } }),
          tx.position.findMany({ where: { organizationId: org.id }, select: { id: true, name: true } }),
        ]);
        return {
          org,
          adminUser,
          adminRole,
          unitIds: unitMap,
          roleIds: new Map(roleRows.map((r) => [nameKey(r.name), r.id])),
          positionIds: new Map(positionRows.map((p) => [nameKey(p.name), p.id])),
        };
      });
    });

    // The first line of the organisation's history, so its activity feed does
    // not open empty (the invitations below add theirs).
    // Written as the new administrator: this route is public, so there is no
    // request context, and without one the row has no tenant to belong to.
    await RequestContextStore.run(
      {
        userId: result.adminUser.id,
        organizationId: result.org.id,
        roleId: result.adminRole.id,
        principalType: 'user',
      },
      () =>
        this.audit.record({
          action: 'CREATE',
          entityType: 'Organization',
          entityId: result.org.id,
          metadata: {
            source: 'onboarding',
            roles: payload.roles.length,
            positions: payload.positions.length,
            orgUnits: payload.orgUnits.length,
            kpis: payload.kpis.length,
            invited: payload.team.length,
          },
        }),
    );

    const invites = await this.inviteTeam(payload.team, body.adminEmail, result);
    const welcomeEmailSent = await this.sendWelcome(body.adminEmail, body.adminFullName, result.org.name);

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
      invites,
      welcomeEmailSent,
    };
  }

  /** Tell the administrator their organisation is ready. Best effort: setup has already succeeded. */
  private async sendWelcome(to: string, fullName: string, orgName: string): Promise<boolean> {
    const link = webAppUrl('/login');
    const first = fullName.trim().split(/\s+/)[0] ?? '';
    try {
      await this.email.send({
        to,
        subject: `Welcome to KPI Nexus — ${orgName} is ready`,
        html:
          `<p>Hi ${escapeHtml(first)},</p>` +
          `<p><strong>${escapeHtml(orgName)}</strong> is set up on KPI Nexus and you are its administrator.</p>` +
          `<p><a href="${link}">Sign in</a> with this email address. The dashboard lists what to do next.</p>`,
        text: `Hi ${first},\n\n${orgName} is set up on KPI Nexus and you are its administrator.\nSign in: ${link}\nThe dashboard lists what to do next.`,
      });
      return true;
    } catch (err) {
      this.logger.warn(`welcome email failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  /**
   * Invite the team the wizard was given (plan 3.2c), as the new administrator
   * and through the same path as People → Invite, so each person gets a normal
   * one-time link and email. It runs after the organisation is committed: an
   * invitation that fails is reported, and does not undo the organisation.
   */
  private async inviteTeam(
    team: readonly DraftTeamMember[],
    adminEmail: string,
    created: {
      org: { id: string };
      adminUser: { id: string };
      adminRole: { id: string };
      unitIds: Map<string, string>;
      roleIds: Map<string, string>;
      positionIds: Map<string, string>;
    },
  ): Promise<OnboardingInvite[]> {
    if (team.length === 0) return [];
    const ctx = {
      userId: created.adminUser.id,
      organizationId: created.org.id,
      roleId: created.adminRole.id,
      principalType: 'user' as const,
    };
    const userIds = new Map<string, string>([[nameKey(adminEmail), created.adminUser.id]]);
    const outcome = new Map<string, OnboardingInvite>();

    await RequestContextStore.run(ctx, async () => {
      for (const person of managersFirst(team)) {
        const email = person.email.trim().toLowerCase();
        try {
          const managerId = person.manager?.trim() ? userIds.get(nameKey(person.manager)) : undefined;
          const invited = await this.users.invite({
            email,
            fullName: person.fullName.trim(),
            roleId: person.role?.trim() ? created.roleIds.get(nameKey(person.role)) : undefined,
            positionId: person.position?.trim() ? created.positionIds.get(nameKey(person.position)) : undefined,
            managerId,
          });
          userIds.set(email, invited.user.id);
          const unitId = person.unit?.trim() ? created.unitIds.get(nameKey(person.unit)) : undefined;
          if (unitId) {
            await this.prisma.orgUnitMember.create({
              data: { organizationId: created.org.id, orgUnitId: unitId, userId: invited.user.id },
            });
          }
          outcome.set(email, { email, invited: true, emailSent: invited.emailSent, inviteToken: invited.inviteToken });
        } catch (err) {
          const reason = err instanceof Error ? err.message : 'Could not invite this person';
          this.logger.warn(`onboarding invite failed (org ${created.org.id}): ${reason}`);
          outcome.set(email, { email, invited: false, error: reason });
        }
      }
    });
    // In the order they were listed, not the order they were invited in.
    return team.map((p) => outcome.get(p.email.trim().toLowerCase())!);
  }
}
