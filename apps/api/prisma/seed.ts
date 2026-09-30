import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const CATEGORIES = ["Material Esportivo", "Material de Limpeza", "Material Administrativo", "Ferramentas", "Equipamentos", "Uniformes", "Materiais Diversos"];

// DADOS DE DESENVOLVIMENTO — identificados com o prefixo "[DEV]" e código DEV-*.
const SAMPLE_ITEMS = [
  { code: "DEV-001", name: "[DEV] Bola de Futebol", category: "Material Esportivo", unit: "UN", stock: 10, min: 4, requiresReturn: false },
  { code: "DEV-002", name: "[DEV] Projetor", category: "Equipamentos", unit: "UN", stock: 2, min: 1, requiresReturn: true },
  { code: "DEV-003", name: "[DEV] Caixa de Som", category: "Equipamentos", unit: "UN", stock: 3, min: 1, requiresReturn: true },
  { code: "DEV-004", name: "[DEV] Detergente 500ml", category: "Material de Limpeza", unit: "UN", stock: 3, min: 5, requiresReturn: false },
  { code: "DEV-005", name: "[DEV] Papel A4 (resma)", category: "Material Administrativo", unit: "PCT", stock: 20, min: 5, requiresReturn: false },
  { code: "DEV-006", name: "[DEV] Furadeira", category: "Ferramentas", unit: "UN", stock: 1, min: 1, requiresReturn: true },
];

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@udv-pg.local").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "trocar-esta-senha-123";
  if (process.env.NODE_ENV === "production" && password === "trocar-esta-senha-123") {
    throw new Error("Defina SEED_ADMIN_PASSWORD antes de rodar o seed em produção.");
  }

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { name: "Administrador", email, passwordHash: await bcrypt.hash(password, 12), role: "ADMIN" },
  });
  console.log(`✔ Usuário ADMIN: ${admin.email}`);

  const cats = new Map<string, string>();
  for (const name of CATEGORIES) {
    const c = await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
    cats.set(name, c.id);
  }
  console.log(`✔ ${CATEGORIES.length} categorias`);

  if (process.env.SEED_SAMPLE_DATA === "false") return;

  for (const s of SAMPLE_ITEMS) {
    const exists = await prisma.item.findUnique({ where: { code: s.code } });
    if (exists) continue;
    await prisma.$transaction(async (tx) => {
      const item = await tx.item.create({
        data: { code: s.code, name: s.name, categoryId: cats.get(s.category)!, unit: s.unit, minStock: s.min, requiresReturn: s.requiresReturn, currentStock: s.stock, location: "Depósito (dados de desenvolvimento)" },
      });
      await tx.stockMovement.create({
        data: { itemId: item.id, type: "ENTRADA", quantity: s.stock, previousStock: 0, newStock: s.stock, userId: admin.id, origin: "Seed", note: "Movimentação de teste — dados de desenvolvimento" },
      });
    });
  }
  console.log(`✔ ${SAMPLE_ITEMS.length} itens de exemplo (prefixo [DEV])`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
