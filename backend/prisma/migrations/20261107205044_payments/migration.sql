-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'REJECTED';

-- CreateIndex
CREATE INDEX "payments_status_created_at_idx" ON "payments"("status", "created_at");

