import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { scrapeNewsletters } from "./utils";
import { Feed } from "feed";
import webpush from "web-push";
import schedule from "node-schedule";

// Initialize web-push with VAPID keys
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (!vapidPublicKey || !vapidPrivateKey) {
  throw new Error('VAPID keys are required for push notifications. Please set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY environment variables.');
}

webpush.setVapidDetails(
  'mailto:team@downtowner.com',
  vapidPublicKey,
  vapidPrivateKey
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
        console.log(`Found ${newNewsletters.length} new newsletters, sending notifications...`);

        // Send push notifications
        const subscriptions = await storage.getActiveSubscriptions();
        console.log(`Sending notifications to ${subscriptions.length} subscribers`);

        const notificationPayload = JSON.stringify({
          title: 'New Newsletters Available',
          body: `${newNewsletters.length} new newsletter${newNewsletters.length > 1 ? 's' : ''} published!`,
          icon: '/icon.png'
        });


  app.post("/api/subscriptions/:id/settings", async (req, res) => {
    try {
      const subscriptionId = parseInt(req.params.id);
      await storage.saveNotificationSettings(subscriptionId, {
        newsletter_notifications: req.body.newsletter_notifications
      });
      res.json({ message: "Notification settings updated successfully" });
    } catch (error) {
      console.error('Error updating notification settings:', error);
      res.status(500).json({ message: "Failed to update notification settings" });
    }
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
      console.log('Received subscription request:', {
        endpoint: req.body.endpoint,
        auth: req.body.keys?.auth ? '[present]' : '[missing]',
        p256dh: req.body.keys?.p256dh ? '[present]' : '[missing]'
      });

      if (!req.body.endpoint || !req.body.keys?.auth || !req.body.keys?.p256dh) {
        throw new Error('Invalid subscription data');
      }

      await storage.addSubscription({
        endpoint: req.body.endpoint,
        auth: req.body.keys.auth,
        p256dh: req.body.keys.p256dh
      });

      // Test the subscription with a welcome notification
      try {
        await webpush.sendNotification({
          endpoint: req.body.endpoint,
          keys: {
            auth: req.body.keys.auth,
            p256dh: req.body.keys.p256dh
          }
        }, JSON.stringify({
          title: 'Subscription Successful',
          body: 'You will now receive notifications for new newsletters!',
          icon: '/icon.png'
        }));
        console.log('Welcome notification sent successfully');
      } catch (notifError) {
        console.error('Failed to send welcome notification:', notifError);
      }

      res.json({ message: "Subscription added successfully" });
    } catch (error) {
      console.error('Error adding subscription:', error);
      res.status(500).json({ 
        message: "Failed to add subscription",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
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