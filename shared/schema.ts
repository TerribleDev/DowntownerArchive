import {
  pgTable,
  text,
  serial,
  date,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const newsletters = pgTable("newsletters", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  date: date("date").notNull(),
  url: text("url").notNull().unique(),
  description: text("description"),
  thumbnail: text("thumbnail"),
  content: text("content"),
  hasDetails: boolean("has_details").default(false),
  last_checked: timestamp("last_checked"),
});

export const insertNewsletterSchema = createInsertSchema(newsletters).pick({
  title: true,
  date: true,
  url: true,
  description: true,
  thumbnail: true,
  content: true,
  hasDetails: true,
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

export const notificationSettings = pgTable("notification_settings", {
  id: serial("id").primaryKey(),
  subscription_id: serial("subscription_id").references(() => subscriptions.id),
  newsletter_notifications: boolean("newsletter_notifications").default(true),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const insertNotificationSettingsSchema =
  createInsertSchema(notificationSettings);
export type InsertNotificationSettings = z.infer<
  typeof insertNotificationSettingsSchema
>;
export type NotificationSettings = typeof notificationSettings.$inferSelect;