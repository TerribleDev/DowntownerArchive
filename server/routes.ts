import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { scrapeNewsletters, retryMissingDetails } from "./utils";
import { Feed } from "feed";
import webpush from "web-push";
import schedule from "node-schedule";
import fs from "fs";
import path from "path";

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
      let newNewslettersCount = 0;

      await scrapeNewsletters(async (newsletter) => {
        // Check if newsletter already exists
        const exists = existingNewsletters.some(existing => existing.url === newsletter.url);
        if (!exists) {
          await storage.importNewsletter(newsletter);
          newNewslettersCount++;
          console.log(`Imported new newsletter: ${newsletter.title}`);
        }
      });

      if (newNewslettersCount > 0) {
        console.log(`Found ${newNewslettersCount} new newsletters, sending notifications...`);

        // Send push notifications for new newsletters
        const subscriptions = await storage.getActiveSubscriptions();
        console.log(`Sending notifications to ${subscriptions.length} subscribers`);

        const notificationPayload = JSON.stringify({
          title: 'New Newsletters Available',
          body: `${newNewslettersCount} new newsletter${newNewslettersCount > 1 ? 's' : ''} published!`,
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

      // Retry fetching details for newsletters without them
      const newslettersWithoutDetails = await storage.getNewslettersWithoutDetails();
      const updatedNewsletters = await retryMissingDetails(newslettersWithoutDetails);

      for (const newsletter of updatedNewsletters) {
        if (newsletter.id) {
          await storage.updateNewsletterDetails(newsletter.id, {
            thumbnail: newsletter.thumbnail,
            content: newsletter.content,
            description: newsletter.description,
            hasDetails: newsletter.hasDetails,
          });
          console.log(`Updated details for newsletter: ${newsletter.title}`);
        }
      }

    } catch (error) {
      console.error('Background job failed:', error);
    }
  });

  // Add CORS middleware for the embed route
  app.use("/embed", (req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    next();
  });

  // New route for embedded content
  app.get("/embed", async (req, res) => {
    try {
      const newsletters = await storage.getNewsletters();

      // Read the Tailwind CSS file
      const cssPath = path.join(process.cwd(), "dist", "public", "assets", "index.css");
      const css = fs.existsSync(cssPath) 
        ? await fs.promises.readFile(cssPath, 'utf-8')
        : '/* CSS not found */';

      const content = `
        <style>
          ${css}
          /* Additional styles for shadow DOM isolation */
          :host {
            all: initial;
            display: block;
          }
          .newsletter-embed {
            background: var(--background, white);
            color: var(--foreground, black);
            padding: 1rem;
          }
        </style>
        <div class="newsletter-embed">
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            ${newsletters.slice(0, 6).map(newsletter => `
              <article class="bg-card rounded-lg shadow p-4">
                <h2 class="text-xl font-semibold mb-2">${newsletter.title}</h2>
                <time class="text-sm text-muted-foreground">${new Date(newsletter.date).toLocaleDateString()}</time>
                ${newsletter.thumbnail ? `
                  <img src="${newsletter.thumbnail}" alt="${newsletter.title}" class="w-full h-40 object-cover rounded-md my-4">
                ` : ''}
                ${newsletter.description ? `
                  <p class="text-sm text-muted-foreground line-clamp-3">${newsletter.description}</p>
                ` : ''}
                <a href="${newsletter.url}" target="_blank" rel="noopener noreferrer" 
                   class="inline-block mt-4 text-primary hover:underline">
                  Read more
                </a>
              </article>
            `).join('')}
          </div>
        </div>
      `;

      res.header('Content-Type', 'text/html');
      res.send(content);
    } catch (error) {
      console.error('Error generating embedded content:', error);
      res.status(500).json({ message: "Failed to generate embedded content" });
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
      let importedCount = 0;
      await scrapeNewsletters(async (newsletter) => {
        await storage.importNewsletter(newsletter);
        importedCount++;
      });
      res.json({ message: `Successfully imported ${importedCount} newsletters` });
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

  app.get("/api/rss", async (_req, res) => {
    try {
      const newsletters = await storage.getNewsletters();

      const feed = new Feed({
        title: "The Downtowner Newsletter",
        description: "Downtown Nashua's Newsletter Archive",
        id: "https://downtowner.com/",
        link: "https://downtowner.com/",
        language: "en",
        copyright: "All rights reserved",
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
          description: newsletter.description || '',
          date: new Date(newsletter.date),
          image: newsletter.thumbnail || undefined
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