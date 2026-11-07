-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'REQUESTED';

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "quantity_text" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "bill_note" TEXT,
ADD COLUMN     "quoted_at" TIMESTAMP(3),
ADD COLUMN     "raw_list" TEXT;

