
import "dotenv/config";
import app from "./app";
import { prisma } from "./lib/prisma";

const PORT = Number(process.env.PORT) || 5000;

async function startServer() {
  try {
    await prisma.$connect();

    const server = app.listen(PORT, () => {
      console.log(`MiniLedger API running at http://localhost:${PORT}`);
    });

    const shutdown = async () => {
      server.close(async () => {
        await prisma.$disconnect();
        process.exit(0);
      });
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error) {
    console.error("Failed to start MiniLedger:", error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

void startServer();
