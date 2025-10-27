import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

const prisma = new PrismaClient()

async function main() {
    const dataDir = path.join(__dirname, 'data')
    if (!fs.existsSync(dataDir)) {
        console.log('❌ No data directory found.')
        return
    }

    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'))
    const models = Object.keys(prisma).filter(
        k => !k.startsWith('_') && typeof (prisma as any)[k].deleteMany === 'function'
    )

    console.log('🧩 Models detected:', models.join(', '))

    // Step 1: Clear database
    console.log('🧹 Clearing all tables...')
    await prisma.$executeRawUnsafe('SET session_replication_role = replica;')
    for (const model of models) {
        try {
            await (prisma as any)[model].deleteMany()
            console.log(`🗑 Cleared ${model}`)
        } catch (e: any) {
            console.log(`⚠️ Failed to clear ${model}: ${e.message}`)
        }
    }

    console.log('✅ Database cleared!')

    // Step 2: Restore data in multiple passes
    const MAX_PASSES = 5
    for (let pass = 1; pass <= MAX_PASSES; pass++) {
        console.log(`\n🔁 Restore pass ${pass}/${MAX_PASSES}`)
        let inserted = 0

        for (const model of models) {
            const file = files.find(f => f.replace('.json', '').toLowerCase() === model.toLowerCase())
            if (!file) continue

            const filePath = path.join(dataDir, file)
            const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
            if (!jsonData.length) continue

            const clientModel = (prisma as any)[model]
            for (const record of jsonData) {
                try {
                    await clientModel.create({ data: record })
                    inserted++
                } catch (e: any) {
                    // Skip for now, try again in next pass
                    continue
                }
            }
        }

        console.log(`✅ Pass ${pass} completed. Inserted ${inserted} records.`)
        if (inserted === 0) break // stop if nothing new inserted
    }

    await prisma.$executeRawUnsafe('SET session_replication_role = DEFAULT;')
    console.log('\n🎉 Database fully restored from export!')
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect())