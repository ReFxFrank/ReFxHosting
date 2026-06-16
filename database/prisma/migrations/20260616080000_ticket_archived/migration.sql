-- Add an ARCHIVED state for "storing" closed/past tickets out of the active queue.
ALTER TYPE "TicketState" ADD VALUE IF NOT EXISTS 'ARCHIVED';
