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

    await prisma.$executeRawUnsafe('SET session_replication_role = replica;')
    for (const model of models) {
        try {
            await (prisma as any)[model].deleteMany()
        } catch (e: any) {
            console.log(`⚠️ Failed to clear ${model}: ${e.message}`)
        }
    }

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
                    continue 
                }
            }
        }

        if (inserted === 0) break
    }


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
        } catch (e: any) {

        }
    }

    await prisma.$executeRawUnsafe('SET session_replication_role = DEFAULT;')
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect())