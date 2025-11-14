-- CreateTable
CREATE TABLE "TemplateVariable" (
    "id" SERIAL NOT NULL,
    "templateId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateVariable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateStyle" (
    "id" SERIAL NOT NULL,
    "templateId" INTEGER NOT NULL,
    "css" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemplateStyle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TemplateVariable_templateId_key_key" ON "TemplateVariable"("templateId", "key");

-- AddForeignKey
ALTER TABLE "TemplateVariable" ADD CONSTRAINT "TemplateVariable_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateStyle" ADD CONSTRAINT "TemplateStyle_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
