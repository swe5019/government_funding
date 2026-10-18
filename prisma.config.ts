import "dotenv/config";
import { defineConfig } from "prisma/config";

// The CLI (migrate, studio) should use the direct, non-pooled connection.
// Neon: DIRECT_URL = the unpooled host; DATABASE_URL = the "-pooler" host used by the app.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  },
});
