CREATE TYPE "BirthChartInterpretationType" AS ENUM ('sun', 'moon', 'ascendant');

CREATE TABLE "birth_chart_interpretation" (
  "id" TEXT NOT NULL,
  "type" "BirthChartInterpretationType" NOT NULL,
  "sign" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "birth_chart_interpretation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "birth_chart_interpretation_type_sign_key"
ON "birth_chart_interpretation"("type", "sign");
