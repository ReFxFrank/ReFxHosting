import { Ticket, TicketCategory } from '@prisma/client';

/**
 * Computed SLA status for a ticket against its category's targets.
 */
export interface SlaStatus {
  /** Deadline for the first staff response, or null when no category/target. */
  firstResponseDueAt: Date | null;
  /** Deadline for resolution, or null when no category/target. */
  resolutionDueAt: Date | null;
  /** True when the first response has (or would have) missed its deadline. */
  firstResponseBreached: boolean;
  /** True when resolution has (or would have) missed its deadline. */
  resolutionBreached: boolean;
}

/** Minimal shape needed to compute SLA — keeps the function easy to unit test. */
type SlaTicket = Pick<Ticket, 'createdAt' | 'firstResponseAt' | 'resolvedAt'>;
type SlaCategory = Pick<
  TicketCategory,
  'slaFirstResponseMin' | 'slaResolutionMin'
>;

const MS_PER_MIN = 60_000;

/**
 * Pure SLA calculator.
 *
 * Due dates are derived from the ticket's creation time plus the category's
 * targets (in minutes). A target is considered breached when the relevant
 * timestamp (first response / resolution) is past the deadline; if that
 * timestamp hasn't happened yet we evaluate against `now`, so an open ticket
 * that has already blown past its window reports as breached.
 *
 * With no category (or category passed as null) there are no targets and
 * nothing can breach.
 */
export function computeSlaStatus(
  ticket: SlaTicket,
  category: SlaCategory | null | undefined,
  now: Date = new Date(),
): SlaStatus {
  if (!category) {
    return {
      firstResponseDueAt: null,
      resolutionDueAt: null,
      firstResponseBreached: false,
      resolutionBreached: false,
    };
  }

  const createdMs = ticket.createdAt.getTime();
  const firstResponseDueAt = new Date(
    createdMs + category.slaFirstResponseMin * MS_PER_MIN,
  );
  const resolutionDueAt = new Date(
    createdMs + category.slaResolutionMin * MS_PER_MIN,
  );

  const firstResponseMark = ticket.firstResponseAt ?? now;
  const resolutionMark = ticket.resolvedAt ?? now;

  return {
    firstResponseDueAt,
    resolutionDueAt,
    firstResponseBreached: firstResponseMark.getTime() > firstResponseDueAt.getTime(),
    resolutionBreached: resolutionMark.getTime() > resolutionDueAt.getTime(),
  };
}
