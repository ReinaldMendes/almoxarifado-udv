import { env } from "./config/env";
import { prisma } from "./lib/prisma";
import { createApp } from "./app";

const app = createApp();
const server = app.listen(env.PORT, "0.0.0.0", () => {
  console.log(`API do Almoxarifado UDV ouvindo na porta ${env.PORT} (${env.NODE_ENV})`);
});

const shutdown = async () => {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
