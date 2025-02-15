var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/queue.ts
import Queue from "bull";

// server/utils.ts
import axios from "axios";
import * as cheerio from "cheerio";
var ROBLY_ARCHIVE_URL = "https://app.robly.com/public/archives?a=b31b32385b5904b5";
async function scrapeNewsletterContent(url) {
  try {
    const { data } = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5"
      },
      timeout: 15e3
    });
    const $ = cheerio.load(data);
    const images = $("img").toArray();
    const thumbnailUrl = images.length > 1 ? $(images[1]).attr("src") : null;
    const content = $("body").text().trim();
    return {
      thumbnail: thumbnailUrl,
      content
    };
  } catch (error) {
    console.warn("Error scraping newsletter content:", error);
    return { thumbnail: null, content: null };
  }
}
async function scrapeNewsletters() {
  try {
    const { data } = await axios.get(ROBLY_ARCHIVE_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5"
      },
      timeout: 1e4
    });
    const $ = cheerio.load(data);
    const newsletters2 = [];
    const links = $('a[href^="/archive?id="]');
    console.log(`Found ${links.length} newsletter links`);
    for (const element of links.toArray()) {
      const $element = $(element);
      const url = $element.attr("href");
      const fullText = $element.parent().text().trim();
      const match = fullText.match(/^([A-Za-z]+ \d{1,2}, \d{4}) - (.+)$/);
      if (match && url) {
        const [, dateStr, title] = match;
        try {
          const date2 = new Date(dateStr).toISOString().split("T")[0];
          const fullUrl = `https://app.robly.com${url}`;
          const { thumbnail, content } = await scrapeNewsletterContent(fullUrl);
          newsletters2.push({
            title: title.trim(),
            date: date2,
            url: fullUrl,
            thumbnail,
            content,
            description: content ? content.slice(0, 200) + "..." : null
          });
          console.log(`Processed newsletter: ${title}`);
        } catch (err) {
          console.warn("Error processing date for newsletter:", { dateStr, title }, err);
        }
      }
    }
    if (newsletters2.length === 0) {
      console.error("No newsletters found in HTML. First 500 chars of response:", data.slice(0, 500));
      throw new Error("No newsletters found in the archive");
    }
    console.log(`Successfully scraped ${newsletters2.length} newsletters`);
    return newsletters2;
  } catch (error) {
    console.error("Error scraping newsletters:", error);
    if (axios.isAxiosError(error)) {
      console.error("Axios error details:", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
    }
    throw error;
  }
}

// server/db.ts
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  insertNewsletterSchema: () => insertNewsletterSchema,
  insertSubscriptionSchema: () => insertSubscriptionSchema,
  newsletters: () => newsletters,
  subscriptions: () => subscriptions
});
import { pgTable, text, serial, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
var newsletters = pgTable("newsletters", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  date: date("date").notNull(),
  url: text("url").notNull(),
  description: text("description"),
  thumbnail: text("thumbnail"),
  content: text("content"),
  last_checked: timestamp("last_checked")
});
var insertNewsletterSchema = createInsertSchema(newsletters).pick({
  title: true,
  date: true,
  url: true,
  description: true,
  thumbnail: true,
  content: true
});
var subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  endpoint: text("endpoint").notNull(),
  auth: text("auth").notNull(),
  p256dh: text("p256dh").notNull(),
  created_at: timestamp("created_at").defaultNow()
});
var insertSubscriptionSchema = createInsertSchema(subscriptions).pick({
  endpoint: true,
  auth: true,
  p256dh: true
});

// server/db.ts
neonConfig.webSocketConstructor = ws;
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?"
  );
}
var pool = new Pool({ connectionString: process.env.DATABASE_URL });
var db = drizzle({ client: pool, schema: schema_exports });

// server/storage.ts
import { desc, ilike, or } from "drizzle-orm";
var DatabaseStorage = class {
  async getNewsletters() {
    return await db.select().from(newsletters).orderBy(desc(newsletters.date));
  }
  async searchNewsletters(query) {
    const lowercaseQuery = query.toLowerCase();
    return await db.select().from(newsletters).where(
      or(
        ilike(newsletters.title, `%${lowercaseQuery}%`),
        ilike(newsletters.content || "", `%${lowercaseQuery}%`),
        ilike(newsletters.description || "", `%${lowercaseQuery}%`)
      )
    ).orderBy(desc(newsletters.date));
  }
  async importNewsletters(newNewsletters) {
    const batchSize = 50;
    for (let i = 0; i < newNewsletters.length; i += batchSize) {
      const batch = newNewsletters.slice(i, i + batchSize);
      await db.insert(newsletters).values(batch);
    }
  }
  async addSubscription(subscription) {
    await db.insert(subscriptions).values(subscription);
  }
  async getSubscriptions() {
    return await db.select().from(subscriptions);
  }
};
var storage = new DatabaseStorage();

// server/queue.ts
import webpush from "web-push";
var REDIS_URL = process.env.REPLIT_REDIS_URL || "redis://localhost:6379";
var newsletterQueue = new Queue("newsletter-updates", REDIS_URL);
newsletterQueue.process(async (job) => {
  console.log("Processing newsletter update job...");
  try {
    const existingNewsletters = await storage.getNewsletters();
    const scrapedNewsletters = await scrapeNewsletters();
    const newNewsletters = scrapedNewsletters.filter(
      (scraped) => !existingNewsletters.some(
        (existing) => existing.url === scraped.url
      )
    );
    if (newNewsletters.length > 0) {
      await storage.importNewsletters(newNewsletters);
      console.log(`Found ${newNewsletters.length} new newsletters, sending notifications...`);
      const subscriptions2 = await storage.getSubscriptions();
      console.log(`Sending notifications to ${subscriptions2.length} subscribers`);
      const notificationPayload = JSON.stringify({
        title: "New Newsletters Available",
        body: `${newNewsletters.length} new newsletter${newNewsletters.length > 1 ? "s" : ""} published!`,
        icon: "/icon.png"
      });
      const results = await Promise.allSettled(
        subscriptions2.map(
          (subscription) => webpush.sendNotification({
            endpoint: subscription.endpoint,
            keys: {
              auth: subscription.auth,
              p256dh: subscription.p256dh
            }
          }, notificationPayload)
        )
      );
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;
      console.log(`Push notifications sent: ${succeeded} succeeded, ${failed} failed`);
    } else {
      console.log("No new newsletters found");
    }
  } catch (error) {
    console.error("Queue job failed:", error);
    throw error;
  }
});
newsletterQueue.on("error", (error) => {
  console.error("Queue error:", error);
});
newsletterQueue.on("completed", (job) => {
  console.log(`Job ${job.id} completed successfully`);
});
newsletterQueue.on("failed", (job, error) => {
  console.error(`Job ${job.id} failed:`, error);
});
export {
  newsletterQueue
};
