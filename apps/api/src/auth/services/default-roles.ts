/**
 * The four default roles seeded into every new organization. They live in
 * `@kpi-nexus/contracts` so the setup wizard can offer exactly the same roles
 * a plain registration creates; this module keeps the import path the API uses.
 */
export { DEFAULT_ROLES, type DefaultRoleSeed } from '@kpi-nexus/contracts';
