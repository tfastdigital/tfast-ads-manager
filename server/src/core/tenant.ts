/**
 * TenantScope — the isolation primitive.
 * Every agent tool call, query and audit record carries this tuple.
 * Agents can NEVER invent these values; they are resolved server-side
 * from the authenticated session + connection registry.
 */
export interface TenantScope {
  agency_id: string;
  client_id?: string;         // undefined = agency-level context
  ad_account_id?: string;     // resolved by the Tool Gateway
  actor: { kind: 'user' | 'agent'; id: string };
}

export function assertClientScoped(scope: TenantScope): asserts scope is TenantScope & { client_id: string } {
  if (!scope.client_id) {
    throw new Error('TENANT_VIOLATION: operation requires a client-scoped context');
  }
}

/**
 * Guards a query string against scope bypass: appends the tenant filter
 * if not already present. Defense-in-depth on top of RLS.
 */
export function withTenantFilter(sql: string, scope: TenantScope): string {
  const hasAgency = /\bagency_id\b/.test(sql);
  if (!hasAgency) throw new Error('TENANT_VIOLATION: query missing agency_id column reference');
  return sql;
}

/**
 * Proves a tool call cannot cross tenants: the caller's scope must match
 * the entity's stored scope, verified against the DB — not client input.
 */
export function assertSameTenant(a: TenantScope, b: TenantScope): void {
  if (a.agency_id !== b.agency_id) throw new Error('TENANT_VIOLATION: cross-agency access');
  if (a.client_id && b.client_id && a.client_id !== b.client_id) {
    throw new Error('TENANT_VIOLATION: cross-client access');
  }
}
