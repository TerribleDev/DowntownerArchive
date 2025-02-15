import { pgTable, text, serial, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const newsletters = pgTable("newsletters", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  date: date("date").notNull(),
  url: text("url").notNull(),
  description: text("description"),
  thumbnail: text("thumbnail"),
  content: text("content"),
  last_checked: timestamp("last_checked"),
});

export const insertNewsletterSchema = createInsertSchema(newsletters).pick({
  title: true,
  date: true,
  url: true,
  description: true,
  thumbnail: true,
  content: true,
});

export type InsertNewsletter = z.infer<typeof insertNewsletterSchema>;
export type Newsletter = typeof newsletters.$inferSelect;

// Schema for push notification subscriptions
export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  endpoint: text("endpoint").notNull(),
  auth: text("auth").notNull(),
  p256dh: text("p256dh").notNull(),
  created_at: timestamp("created_at").defaultNow(),
});

export const insertSubscriptionSchema = createInsertSchema(subscriptions).pick({
  endpoint: true,
  auth: true,
  p256dh: true,
});

export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptions.$inferSelect;