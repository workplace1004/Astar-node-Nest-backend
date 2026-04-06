-- AlterTable
ALTER TABLE "User" ADD COLUMN "extras_favorite_service_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "User" ADD COLUMN "extras_cart_service_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];
