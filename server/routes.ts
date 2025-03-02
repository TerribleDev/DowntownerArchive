import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { scrapeNewsletters, retryMissingDetails } from "./utils";
import { Feed } from "feed";
import webpush from "web-push";
import schedule from "node-schedule";

// Initialize web-push with VAPID keys
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (!vapidPublicKey || !vapidPrivateKey) {
  throw new Error(
    "VAPID keys are required for push notifications. Please set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY environment variables.",
  );
}

webpush.setVapidDetails(
  "mailto:support@greatamericandowntown.org",
  vapidPublicKey,
  vapidPrivateKey,
);

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup background job to check for new newsletters
  schedule.scheduleJob("0 */4 * * *", async function () {
    try {
      const existingNewsletters = await storage.getNewsletters();
      let newNewslettersCount = 0;

      await scrapeNewsletters(async (newsletter) => {
        // Check if newsletter already exists
        const exists = existingNewsletters.some(
          (existing) => existing.url === newsletter.url,
        );
        if (!exists) {
          await storage.importNewsletter(newsletter);
          newNewslettersCount++;
          console.log(`Imported new newsletter: ${newsletter.title}`);
        }
      });

      if (newNewslettersCount > 0) {
        console.log(
          `Found ${newNewslettersCount} new newsletters, sending notifications...`,
        );

        // Send push notifications for new newsletters
        const subscriptions = await storage.getActiveSubscriptions();
        console.log(
          `Sending notifications to ${subscriptions.length} subscribers`,
        );

        const notificationPayload = JSON.stringify({
          title: "New Newsletters Available",
          body: `${newNewslettersCount} new newsletter${newNewslettersCount > 1 ? "s" : ""} published!`,
          icon: "/icon.png",
        });

        const results = await Promise.allSettled(
          subscriptions.map((subscription) =>
            webpush.sendNotification(
              {
                endpoint: subscription.endpoint,
                keys: {
                  auth: subscription.auth,
                  p256dh: subscription.p256dh,
                },
              },
              notificationPayload,
            ),
          ),
        );

        const succeeded = results.filter(
          (r) => r.status === "fulfilled",
        ).length;
        const failed = results.filter((r) => r.status === "rejected").length;
        console.log(
          `Push notifications sent: ${succeeded} succeeded, ${failed} failed`,
        );
      }

      // Retry fetching details for newsletters without them
      const newslettersWithoutDetails =
        await storage.getNewslettersWithoutDetails();
      const updatedNewsletters = await retryMissingDetails(
        newslettersWithoutDetails,
      );

      for (const newsletter of updatedNewsletters) {
        // Check if newsletter has an id property before accessing it
        if ('id' in newsletter && newsletter.id) {
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
      console.error("Background job failed:", error);
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

      // Base styles that will ensure proper rendering regardless of parent site styles
      const baseStyles = `
        :host {
          all: initial;
          display: block;
          contain: content;
          color-scheme: light dark;
        }
        *, *::before, *::after {
          box-sizing: border-box;
        }
        .newsletter-embed {
          --background: #ffffff;
          --foreground: #000000;
          --card: #ffffff;
          --card-foreground: #000000;
          --popover: #ffffff;
          --popover-foreground: #000000;
          --primary: #000000;
          --primary-foreground: #ffffff;
          --secondary: #f1f5f9;
          --secondary-foreground: #0f172a;
          --muted: #f1f5f9;
          --muted-foreground: #64748b;
          --accent: #f1f5f9;
          --accent-foreground: #0f172a;
          --border: #e2e8f0;
          --input: #e2e8f0;
          --ring: #000000;

          font-family: system-ui, -apple-system, sans-serif;
          background: var(--background);
          color: var(--foreground);
          padding: 1rem;
          width: 100%;
        }
        @media (prefers-color-scheme: dark) {
          .newsletter-embed {
            --background: #020817;
            --foreground: #ffffff;
            --card: #020817;
            --card-foreground: #ffffff;
            --popover: #020817;
            --popover-foreground: #ffffff;
            --primary: #ffffff;
            --primary-foreground: #000000;
            --secondary: #1e293b;
            --secondary-foreground: #ffffff;
            --muted: #1e293b;
            --muted-foreground: #94a3b8;
            --accent: #1e293b;
            --accent-foreground: #ffffff;
            --border: #1e293b;
            --input: #1e293b;
            --ring: #ffffff;
          }
        }
      `;

      const content = `
        <style>
          ${baseStyles}
          .grid {
            display: grid;
            gap: 1.5rem;
            width: 100%;
          }
          @media (min-width: 768px) {
            .grid { grid-template-columns: repeat(2, 1fr); }
          }
          @media (min-width: 1024px) {
            .grid { grid-template-columns: repeat(3, 1fr); }
          }
          .article {
            background: var(--card);
            border-radius: 0.5rem;
            padding: 1rem;
            box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1);
            border: 1px solid var(--border);
          }
          .title {
            font-size: 1.25rem;
            font-weight: 600;
            margin-bottom: 0.5rem;
            color: var(--card-foreground);
          }
          .date {
            font-size: 0.875rem;
            color: var(--muted-foreground);
          }
          .image {
            width: 100%;
            height: 10rem;
            object-fit: cover;
            border-radius: 0.375rem;
            margin: 1rem 0;
          }
          .description {
            font-size: 0.875rem;
            color: var(--muted-foreground);
            display: -webkit-box;
            -webkit-line-clamp: 3;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }
          .link {
            display: inline-block;
            margin-top: 1rem;
            color: var(--primary);
            text-decoration: none;
          }
          .link:hover {
            text-decoration: underline;
          }
        </style>
        <div class="newsletter-embed">
          <div class="grid">
            ${newsletters
              .slice(0, 6)
              .map(
                (newsletter) => `
              <article class="article">
                <h2 class="title">${newsletter.title}</h2>
                <time class="date">${new Date(newsletter.date).toLocaleDateString()}</time>
                ${
                  newsletter.thumbnail
                    ? `
                  <img src="${newsletter.thumbnail}" alt="${newsletter.title}" class="image">
                `
                    : ""
                }
                ${
                  newsletter.description
                    ? `
                  <p class="description">${newsletter.description}</p>
                `
                    : ""
                }
                <a href="${newsletter.url}" target="_blank" rel="noopener noreferrer" 
                   class="link">
                  Read more
                </a>
              </article>
            `,
              )
              .join("")}
          </div>
        </div>
      `;

      res.header("Content-Type", "text/html");
      res.send(content);
    } catch (error) {
      console.error("Error generating embedded content:", error);
      res.status(500).json({ message: "Failed to generate embedded content" });
    }
  });

  // API Routes
  app.get("/api/newsletters", async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const { newsletters, total } = await storage.getNewslettersPaginated(page, limit);
    res.json({ newsletters, total, page, limit });
  });

  app.get("/api/newsletters/search", async (req, res) => {
    const query = (req.query.q as string) || "";
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const { newsletters, total } = await storage.searchNewslettersPaginated(query, page, limit);
    res.json({ newsletters, total, page, limit });
  });

  app.post("/api/newsletters/import", async (_req, res) => {
    try {
      let importedCount = 0;
      await scrapeNewsletters(async (newsletter) => {
        await storage.importNewsletter(newsletter);
        importedCount++;
      });
      res.json({
        message: `Successfully imported ${importedCount} newsletters`,
      });
    } catch (error) {
      console.error("Error importing newsletters:", error);
      res.status(500).json({ message: "Failed to import newsletters" });
    }
  });
  
  app.post("/api/notifications/test", async (_req, res) => {
    try {
      const subscriptions = await storage.getActiveSubscriptions();
      console.log(`Sending test notification to ${subscriptions.length} subscribers`);
      
      const notificationPayload = JSON.stringify({
        title: "Test Notification",
        body: "This is a test notification from The Downtowner",
        icon: "/icon.png",
      });
      
      const results = await Promise.allSettled(
        subscriptions.map((subscription) =>
          webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                auth: subscription.auth,
                p256dh: subscription.p256dh,
              },
            },
            notificationPayload,
          ),
        ),
      );
      
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;
      console.log(`Test notifications sent: ${succeeded} succeeded, ${failed} failed`);
      
      res.json({
        message: `Test notifications sent: ${succeeded} succeeded, ${failed} failed`,
        totalSubscribers: subscriptions.length,
      });
    } catch (error) {
      console.error("Error sending test notifications:", error);
      res.status(500).json({ message: "Failed to send test notifications" });
    }
  });

  app.post("/api/subscriptions", async (req, res) => {
    try {
      console.log("Received subscription request:", {
        endpoint: req.body.endpoint,
        auth: req.body.keys?.auth ? "[present]" : "[missing]",
        p256dh: req.body.keys?.p256dh ? "[present]" : "[missing]",
      });

      if (
        !req.body.endpoint ||
        !req.body.keys?.auth ||
        !req.body.keys?.p256dh
      ) {
        throw new Error("Invalid subscription data");
      }

      await storage.addSubscription({
        endpoint: req.body.endpoint,
        auth: req.body.keys.auth,
        p256dh: req.body.keys.p256dh,
      });

      // Test the subscription with a welcome notification
      try {
        await webpush.sendNotification(
          {
            endpoint: req.body.endpoint,
            keys: {
              auth: req.body.keys.auth,
              p256dh: req.body.keys.p256dh,
            },
          },
          JSON.stringify({
            title: "Subscription Successful",
            body: "You will now receive notifications for new newsletters!",
            icon: "/icon.png",
          }),
        );
        console.log("Welcome notification sent successfully");
      } catch (notifError) {
        console.error("Failed to send welcome notification:", notifError);
      }

      res.json({ message: "Subscription added successfully" });
    } catch (error) {
      console.error("Error adding subscription:", error);
      res.status(500).json({
        message: "Failed to add subscription",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Comment out this route if saveNotificationSettings is not implemented
  // in your storage interface to avoid TypeScript errors
  /*
  app.post("/api/subscriptions/:id/settings", async (req, res) => {
    try {
      const subscriptionId = parseInt(req.params.id);
      await storage.saveNotificationSettings(subscriptionId, {
        newsletter_notifications: req.body.newsletter_notifications,
      });
      res.json({ message: "Notification settings updated successfully" });
    } catch (error) {
      console.error("Error updating notification settings:", error);
      res
        .status(500)
        .json({ message: "Failed to update notification settings" });
    }
  });
  */

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
        updated: newsletters[0]?.date
          ? new Date(newsletters[0].date)
          : new Date(),
        generator: "The Downtowner RSS Feed",
        feedLinks: {
          rss2: "https://downtowner.com/api/rss",
        },
      });

      for (const newsletter of newsletters) {
        feed.addItem({
          title: newsletter.title,
          id: newsletter.url,
          link: newsletter.url,
          description: newsletter.description || "",
          date: new Date(newsletter.date),
          image: newsletter.thumbnail || undefined,
        });
      }

      res.type("application/xml");
      res.send(feed.rss2());
    } catch (error) {
      console.error("Error generating RSS feed:", error);
      res.status(500).json({ message: "Failed to generate RSS feed" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}