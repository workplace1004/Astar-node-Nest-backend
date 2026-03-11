-- CreateTable
CREATE TABLE "admin_notification_read" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "notification_id" TEXT NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_notification_read_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_notification_read_user_id_notification_id_key" ON "admin_notification_read"("user_id", "notification_id");

-- AddForeignKey
ALTER TABLE "admin_notification_read" ADD CONSTRAINT "admin_notification_read_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
