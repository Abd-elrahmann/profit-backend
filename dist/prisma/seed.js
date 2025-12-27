"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const prisma = new client_1.PrismaClient();
async function main() {
    const dataDir = path_1.default.join(__dirname, 'data');
    if (!fs_1.default.existsSync(dataDir)) {
        console.log('❌ No data directory found.');
        return;
    }
    const files = fs_1.default.readdirSync(dataDir).filter(f => f.endsWith('.json'));
    const models = Object.keys(prisma).filter(k => !k.startsWith('_') && typeof prisma[k].deleteMany === 'function');
    console.log('🧩 Models detected:', models.join(', '));
    console.log('🧹 Clearing all tables...');
    await prisma.$executeRawUnsafe('SET session_replication_role = replica;');
    for (const model of models) {
        try {
            await prisma[model].deleteMany();
            console.log(`🗑 Cleared ${model}`);
        }
        catch (e) {
            console.log(`⚠️ Failed to clear ${model}: ${e.message}`);
        }
    }
    console.log('✅ Database cleared!');
    const MAX_PASSES = 5;
    for (let pass = 1; pass <= MAX_PASSES; pass++) {
        console.log(`\n🔁 Restore pass ${pass}/${MAX_PASSES}`);
        let inserted = 0;
        for (const model of models) {
            const file = files.find(f => f.replace('.json', '').toLowerCase() === model.toLowerCase());
            if (!file)
                continue;
            const filePath = path_1.default.join(dataDir, file);
            const jsonData = JSON.parse(fs_1.default.readFileSync(filePath, 'utf-8'));
            if (!jsonData.length)
                continue;
            const clientModel = prisma[model];
            for (const record of jsonData) {
                try {
                    await clientModel.create({ data: record });
                    inserted++;
                }
                catch (e) {
                    continue;
                }
            }
        }
        console.log(`✅ Pass ${pass} completed. Inserted ${inserted} records.`);
        if (inserted === 0)
            break;
    }
    console.log('\n🔧 Resetting PostgreSQL ID sequences...');
    const tables = await prisma.$queryRawUnsafe(`SELECT c.relname FROM pg_class c WHERE c.relkind = 'r' AND c.relname NOT LIKE 'pg_%' AND c.relname NOT LIKE 'sql_%';`);
    for (const { relname } of tables) {
        try {
            await prisma.$executeRawUnsafe(`
                SELECT setval(
                    pg_get_serial_sequence('"${relname}"', 'id'),
                    COALESCE((SELECT MAX(id) + 1 FROM "${relname}"), 1),
                    false
                )
            `);
            console.log(`🔄 Sequence reset for table: ${relname}`);
        }
        catch (e) {
        }
    }
    await prisma.$executeRawUnsafe('SET session_replication_role = DEFAULT;');
    console.log('\n🎉 Database fully restored and sequences reset!');
}
main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
//# sourceMappingURL=seed.js.map