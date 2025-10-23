// import { PrismaClient } from '@prisma/client';
// const prisma = new PrismaClient();

// async function main() {
//     console.log('🧾 Starting Account Chart seeding...');

//     await prisma.journalLine.deleteMany();
//     await prisma.account.deleteMany();

//     const defaultAccounts = [
//         { code: '1000', name: 'الأصول المتداولة', type: 'ASSET', accountBasicType: 'OTHER', level: 1, nature: 'DEBIT' },
//         { code: '1100', name: 'النقد في البنك / الصندوق', type: 'ASSET', accountBasicType: 'BANK', parentCode: '1000', level: 2, nature: 'DEBIT' },
//         { code: '1200', name: 'حسابات القبض - قروض', type: 'ASSET', accountBasicType: 'LOANS_RECEIVABLE', parentCode: '1000', level: 2, nature: 'DEBIT' },

//         { code: '2000', name: 'الخصوم المتداولة', type: 'LIABILITY', accountBasicType: 'OTHER', level: 1, nature: 'CREDIT' },
//         { code: '2200', name: 'مستحقات المساهمين', type: 'LIABILITY', accountBasicType: 'PARTNER_PAYABLE', parentCode: '2000', level: 2, nature: 'CREDIT' },

//         { code: '3000', name: 'رأس المال', type: 'EQUITY', accountBasicType: 'PARTNER_EQUITY', level: 1, nature: 'CREDIT' },
//         { code: '3200', name: 'الاحتياطيات / الأرباح المبقاة', type: 'EQUITY', accountBasicType: 'OTHER', parentCode: '3000', level: 2, nature: 'CREDIT' },

//         { code: '4000', name: 'الإيرادات', type: 'REVENUE', accountBasicType: 'OTHER', level: 1, nature: 'CREDIT' },
//         { code: '4100', name: 'إيرادات فوائد القروض', type: 'REVENUE', accountBasicType: 'LOAN_INCOME', parentCode: '4000', level: 2, nature: 'CREDIT' },
//         { code: '4200', name: 'إيراد الشركة من المساهمين', type: 'REVENUE', accountBasicType: 'COMPANY_SHARES', parentCode: '4000', level: 2, nature: 'CREDIT' },

//         { code: '5000', name: 'المصروفات', type: 'EXPENSE', accountBasicType: 'OTHER', level: 1, nature: 'DEBIT' },
//         { code: '5100', name: 'مصروف توزيع الأرباح', type: 'EXPENSE', accountBasicType: 'PARTNER_SHARES_EXPENSES', parentCode: '5000', level: 2, nature: 'DEBIT' },
//     ];

//     const codeToId: Record<string, number> = {};
//     for (const acc of defaultAccounts) {
//         const parentId = acc.parentCode ? codeToId[acc.parentCode] : null;
//         const newAcc = await prisma.account.create({
//             data: {
//                 code: acc.code,
//                 name: acc.name,
//                 type: acc.type,
//                 accountBasicType: acc.accountBasicType,
//                 level: acc.level,
//                 nature: acc.nature,
//                 parentId,
//             },
//         });
//         codeToId[acc.code] = newAcc.id;
//     }

//     console.log(`✅ Seeded ${defaultAccounts.length} accounts successfully.`);
// }

// main()
//     .then(async () => {
//         await prisma.$disconnect();
//     })
//     .catch(async (e) => {
//         console.error(e);
//         await prisma.$disconnect();
//         process.exit(1);
//     });