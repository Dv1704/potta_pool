import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL || env('DATABASE_URL'),
    // @ts-ignore
    directUrl: process.env.DIRECT_URL || env('DIRECT_URL'),
  },
})
