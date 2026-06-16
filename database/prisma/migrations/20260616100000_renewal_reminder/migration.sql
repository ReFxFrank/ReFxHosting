-- Dedup flag for the upcoming-renewal reminder email (per current period).
ALTER TABLE "Subscription" ADD COLUMN "renewalReminderSentAt" TIMESTAMP(3);
