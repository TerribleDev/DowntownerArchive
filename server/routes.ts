import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { scrapeNewsletters } from "./utils";
import { Feed } from "feed";
import webpush from "web-push";
import schedule from "node-schedule";

// Initialize web-push with VAPID keys
if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
  console.warn('VAPID keys not set. Push notifications will not work.');
}

webpush.setVapidDetails(
  'mailto:team@downtowner.com',
  process.env.VAPID_PUBLIC_KEY || '',
  process.env.VAPID_PRIVATE_KEY || ''
);

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup background job to check for new newsletters
  schedule.scheduleJob('0 */6 * * *', async function() {
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

        // Send push notifications
        const subscriptions = await storage.getSubscriptions();
        const notificationPayload = JSON.stringify({
          title: 'New Newsletters Available',
          body: `${newNewsletters.length} new newsletter${newNewsletters.length > 1 ? 's' : ''} published!`,
          icon: '/icon.png'
        });

        await Promise.allSettled(
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
      }
    } catch (error) {
      console.error('Background job failed:', error);
    }
  });

  // API Routes
  app.get("/api/newsletters", async (_req, res) => {
    const newsletters = await storage.getNewsletters();
    res.json(newsletters);
  });

  app.get("/api/newsletters/search", async (req, res) => {
    const query = req.query.q as string || "";
    const newsletters = await storage.searchNewsletters(query);
    res.json(newsletters);
  });

  app.post("/api/newsletters/import", async (_req, res) => {
    try {
      const newsletters = await scrapeNewsletters();
      await storage.importNewsletters(newsletters);
      res.json({ message: "Newsletters imported successfully" });
    } catch (error) {
      console.error('Error importing newsletters:', error);
      res.status(500).json({ message: "Failed to import newsletters" });
    }
  });

  app.post("/api/subscriptions", async (req, res) => {
    try {
      const subscription = req.body;
      await storage.addSubscription({
        endpoint: subscription.endpoint,
        auth: subscription.keys.auth,
        p256dh: subscription.keys.p256dh
      });
      res.json({ message: "Subscription added successfully" });
    } catch (error) {
      console.error('Error adding subscription:', error);
      res.status(500).json({ message: "Failed to add subscription" });
    }
  });

  app.get("/api/rss", async (_req, res) => {
    try {
      const newsletters = await storage.getNewsletters();

      const feed = new Feed({
        title: "The Downtowner Newsletter",
        description: "Downtown Nashua's Newsletter Archive",
        id: "https://downtowner.com/",
        link: "https://downtowner.com/",
        language: "en",
        favicon: "https://downtowner.com/favicon.ico",
        updated: newsletters[0]?.date ? new Date(newsletters[0].date) : new Date(),
        generator: "The Downtowner RSS Feed",
        feedLinks: {
          rss2: "https://downtowner.com/api/rss"
        }
      });

      for (const newsletter of newsletters) {
        feed.addItem({
          title: newsletter.title,
          id: newsletter.url,
          link: newsletter.url,
          description: newsletter.description,
          date: new Date(newsletter.date),
          image: newsletter.thumbnail
        });
      }

      res.type('application/xml');
      res.send(feed.rss2());
    } catch (error) {
      console.error('Error generating RSS feed:', error);
      res.status(500).json({ message: "Failed to generate RSS feed" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}