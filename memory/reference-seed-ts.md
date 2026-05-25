---
name: reference-seed-ts
description: The original app's seed.ts is the depth gold standard the new onboarding (P6) must be able to reproduce.
type: reference
---

# Reference: seed.ts (Depth Gold Standard)

## Location

`C:\work\FYP\khan\KPI_NEXUS orignal\backend\prisma\seed.ts` — ~1,945 lines.

## What it contains

A fully populated "demo SaaS company" org named "KPI Nexus Labs":

- **1 organization** (Corporate, fixed ID `org-demo` for idempotent re-seeding)
- **10 roles** with realistic permission sets + hierarchy:
  - COO, VP Engineering, VP Revenue, VP Operations
  - Engineering Manager, Sales Manager, Operations Manager, Team Lead
  - Senior IC, Individual Contributor
- **14+ positions**: Chief Operations Officer, Senior Engineer, Account Executive, Customer Success Specialist, etc.
- **3 department types**: Engineering, Revenue, Operations
- **10 teams/pods** with nesting (Department → Team → Pod): Platform, Product, Enterprise Sales, Growth Sales, Customer Success, People Ops, Reliability Pod, API Pod, etc.
- **50 users** with real names, distributed across teams; manager → direct-report chains set up
- **20 KPIs** grouped into 5 categories:
  - **Financial**: ARR Growth, Unit Economics, Gross Margin, ...
  - **Sales**: Pipeline Coverage, Win Rate, Average Deal Size, ...
  - **Engineering**: Deployment Frequency, Incident Response, ...
  - **Operations**: ...
  - **People**: Headcount Growth, Retention, ...
- **8–12 historical data points per KPI assignment**: random-walk data simulating real trends
- **Sample alerts**: various severities + triggers
- **Sample integrations**: Salesforce, Jira, Snowflake (CONNECTED status)
- **Global KPI templates**: 50+ templates seeded via templateService

## Why this is the gold standard

When the original-app team built the onboarding wizard v2 (spec at `docs/superpowers/specs/2026-05-17-onboarding-wizard-redesign-design.yaml`), one of the explicit goals was:

> G1: "Can the wizard reproduce seed.ts in a single session?"

The rebuild's P6 (Onboarding 2.0) has the same goal — see plan exit criteria. A new admin going through the wizard must be able to produce an org of this depth (10 roles + 14 positions + 11 units + 20 KPIs + 5 categories) in one session, using the AI generator + templates + manual edits.

## How to use it

- **For P6 (Onboarding 2.0)** validation: load the rich SaaS-Startup template (which is seeded from this file), instantiate, verify the resulting org matches the seed.ts shape
- **For P2 (KPI Engine)** sample data: the `seed.ts` data structure is a good model for what real-world KPI definitions look like
- **For test data** in unit/integration tests: model test fixtures after this depth so we don't over-fit to trivial 1-role-1-KPI scenarios
- **For dashboard preview** (P3): seeding the demo org should produce a populated dashboard that looks good for screenshots
