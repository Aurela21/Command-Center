/**
 * Next.js instrumentation hook — runs once on server startup.
 * Used to start the background cron job poller.
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // Only start cron in the Node.js runtime (not Edge).
  // This also guards against double-start in dev (fast refresh).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startCronPoller } = await import("./lib/cron");
    startCronPoller();
  }
}
