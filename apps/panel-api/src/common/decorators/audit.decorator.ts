import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit_action';

export interface AuditMeta {
  action: string;
  targetType: string;
  /** Name of the route param holding the target id, e.g. 'serverId'. */
  targetParam?: string;
}

/**
 * Declares that a mutating route should be mirrored into AuditLog by the
 * AuditInterceptor. The interceptor records actor, action, target and metadata.
 */
export const Audit = (meta: AuditMeta) => SetMetadata(AUDIT_KEY, meta);
