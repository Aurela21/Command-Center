import "dotenv/config";
import { db } from "../src/db";
import { jobs } from "../src/db/schema";
import { inArray, sql } from "drizzle-orm";

async function main() {
  const result = await db
    .update(jobs)
    .set({
      status: "failed",
      lastError: "Higgsfield 403: Not enough credits",
      updatedAt: sql`NOW()`,
    })
    .where(inArray(jobs.status, ["queued", "submitted", "processing", "retrying"]))
    .returning({ id: jobs.id });
  console.log(`Cleaned up ${result.length} stuck jobs`);
  process.exit(0);
}

main();
