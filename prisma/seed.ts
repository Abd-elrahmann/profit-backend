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

    // Step 2: Restore data
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
                    continue // skip on conflict, try later
                }
            }
        }

        console.log(`✅ Pass ${pass} completed. Inserted ${inserted} records.`)
        if (inserted === 0) break
    }

    // ✅ Step 3: Reset ID sequences (Fix 1)
    console.log('\n🔧 Resetting PostgreSQL ID sequences...')
    const tables = await prisma.$queryRawUnsafe<
        { relname: string }[]
    >(`SELECT c.relname FROM pg_class c WHERE c.relkind = 'r' AND c.relname NOT LIKE 'pg_%' AND c.relname NOT LIKE 'sql_%';`)

    for (const { relname } of tables) {
        try {
            await prisma.$executeRawUnsafe(`
                SELECT setval(
                    pg_get_serial_sequence('"${relname}"', 'id'),
                    COALESCE((SELECT MAX(id) + 1 FROM "${relname}"), 1),
                    false
                )
            `)
            console.log(`🔄 Sequence reset for table: ${relname}`)
        } catch (e: any) {
            // skip tables without "id" column
        }
    }

    await prisma.$executeRawUnsafe('SET session_replication_role = DEFAULT;')
    console.log('\n🎉 Database fully restored and sequences reset!')
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect())