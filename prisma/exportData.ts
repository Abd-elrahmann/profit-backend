import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

const prisma = new PrismaClient()

async function main() {
  const models = Object.keys(prisma).filter(k => !k.startsWith('_') && typeof (prisma as any)[k].findMany === 'function')
  const exportDir = path.join(__dirname, 'data')
  if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir)

  for (const model of models) {
    try {
      const data = await (prisma as any)[model].findMany()
      if (!data.length) continue
      fs.writeFileSync(path.join(exportDir, `${model}.json`), JSON.stringify(data, null, 2))
      console.log(`✅ Exported ${model} (${data.length} rows)`)
    } catch (e) {
      console.log(`⚠️ Failed to export ${model}: ${e.message}`)
    }
  }
}

main().finally(() => prisma.$disconnect())