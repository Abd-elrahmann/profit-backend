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
    const models = Object.keys(prisma).filter(k => !k.startsWith('_') && typeof prisma[k].findMany === 'function');
    const exportDir = path_1.default.join(__dirname, 'data');
    if (!fs_1.default.existsSync(exportDir))
        fs_1.default.mkdirSync(exportDir);
    for (const model of models) {
        try {
            const data = await prisma[model].findMany();
            if (!data.length)
                continue;
            fs_1.default.writeFileSync(path_1.default.join(exportDir, `${model}.json`), JSON.stringify(data, null, 2));
            console.log(`✅ Exported ${model} (${data.length} rows)`);
        }
        catch (e) {
            console.log(`⚠️ Failed to export ${model}: ${e.message}`);
        }
    }
}
main().finally(() => prisma.$disconnect());
//# sourceMappingURL=exportData.js.map