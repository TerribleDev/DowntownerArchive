import Queue from "bull";
import { scrapeNewsletters } from "./utils";
import { storage } from "./storage";
import webpush from "web-push";

// Create queue instance
export const newsletterQueue = new Queue("newsletter-updates", {
  redis: process.env.REDIS_URL || "redis://127.0.0.1:6379"
});

// Process jobs in the queue
newsletterQueue.process(async (job) => {
  console.log("Processing newsletter update job...");
  try {
    const existingNewsletters = await storage.getNewsletters();
    const scrapedNewsletters = await scrapeNewsletters();

    const newNewsletters = scrapedNewsletters.filter(scraped => 
      !existingNewsletters.some(existing => 
        existing.url === scraped.url
      )
    );

    if (newNewsletters.length > 0) {
      await storage.importNewsletters(newNewsletters);
      console.log(`Found ${newNewsletters.length} new newsletters, sending notifications...`);

      // Send push notifications
      const subscriptions = await storage.getSubscriptions();
      console.log(`Sending notifications to ${subscriptions.length} subscribers`);

      const notificationPayload = JSON.stringify({
        title: 'New Newsletters Available',
        body: `${newNewsletters.length} new newsletter${newNewsletters.length > 1 ? 's' : ''} published!`,
        icon: '/icon.png'
      });

      const results = await Promise.allSettled(
        subscriptions.map(subscription =>
          webpush.sendNotification({
            endpoint: subscription.endpoint,
            keys: {
              auth: subscription.auth,
              p256dh: subscription.p256dh
            }
          }, notificationPayload)
        )
      );

      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      console.log(`Push notifications sent: ${succeeded} succeeded, ${failed} failed`);
    }
  } catch (error) {
    console.error('Queue job failed:', error);
    throw error; // Rethrow to mark job as failed
  }
});

// Add error handler
newsletterQueue.on('error', (error) => {
  console.error('Queue error:', error);
});

// Add completed handler
newsletterQueue.on('completed', (job) => {
  console.log(`Job ${job.id} completed successfully`);
});

// Add failed handler
newsletterQueue.on('failed', (job, error) => {
  console.error(`Job ${job.id} failed:`, error);
});
