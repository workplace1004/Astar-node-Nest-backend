-- CreateTable
CREATE TABLE "preview" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "birth_date" TEXT NOT NULL,
    "birth_time" TEXT NOT NULL,
    "birth_place" TEXT NOT NULL,
    "sun_sign" TEXT NOT NULL,
    "moon_sign" TEXT NOT NULL,
    "ascendant_sign" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "preview_pkey" PRIMARY KEY ("id")
);
