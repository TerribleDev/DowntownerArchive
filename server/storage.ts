import { type Newsletter, type InsertNewsletter, type Subscription, type InsertSubscription } from "@shared/schema";
import { db } from "./db";
import { newsletters, subscriptions } from "@shared/schema";
import { desc, ilike, or } from "drizzle-orm";

export interface IStorage {
  getNewsletters(): Promise<Newsletter[]>;
  searchNewsletters(query: string): Promise<Newsletter[]>;
  importNewsletters(newsletters: InsertNewsletter[]): Promise<void>;
  addSubscription(subscription: InsertSubscription): Promise<void>;
  getSubscriptions(): Promise<Subscription[]>;
}

export class DatabaseStorage implements IStorage {
  async getNewsletters(): Promise<Newsletter[]> {
    return await db.select().from(newsletters).orderBy(desc(newsletters.date));
  }

  async searchNewsletters(query: string): Promise<Newsletter[]> {
    const lowercaseQuery = query.toLowerCase();
    return await db
      .select()
      .from(newsletters)
      .where(
        or(
          ilike(newsletters.title, `%${lowercaseQuery}%`),
          ilike(newsletters.content || '', `%${lowercaseQuery}%`),
          ilike(newsletters.description || '', `%${lowercaseQuery}%`)
        )
      )
      .orderBy(desc(newsletters.date));
  }

  async importNewsletters(newNewsletters: InsertNewsletter[]): Promise<void> {
    // Insert in batches to avoid overwhelming the database
    const batchSize = 50;
    for (let i = 0; i < newNewsletters.length; i += batchSize) {
      const batch = newNewsletters.slice(i, i + batchSize);
      await db.insert(newsletters).values(batch);
    }
  }

  async addSubscription(subscription: InsertSubscription): Promise<void> {
    await db.insert(subscriptions).values(subscription);
  }

  async getSubscriptions(): Promise<Subscription[]> {
    return await db.select().from(subscriptions);
  }

  async getActiveSubscriptions(): Promise<Subscription[]> {
    const result = await db
      .select({
        subscription: subscriptions,
        settings: notificationSettings
      })
      .from(subscriptions)
      .leftJoin(notificationSettings, eq(subscriptions.id, notificationSettings.subscription_id))
      .where(eq(notificationSettings.newsletter_notifications, true));
    
    return result.map(r => r.subscription);
  }

  async saveNotificationSettings(subscriptionId: number, settings: Partial<InsertNotificationSettings>): Promise<void> {
    await db
      .insert(notificationSettings)
      .values({
        subscription_id: subscriptionId,
        ...settings
      })
      .onConflictDoUpdate({
        target: [notificationSettings.subscription_id],
        set: settings
      });
  }
}

export const storage = new DatabaseStorage();