import { type Newsletter, type InsertNewsletter, type Subscription, type InsertSubscription, newsletters, subscriptions, notificationSettings } from "@shared/schema";
import { db } from "./db";
import { desc, ilike, or, eq } from "drizzle-orm";

export interface IStorage {
  getNewsletters(): Promise<Newsletter[]>;
  getNewslettersWithoutDetails(): Promise<Newsletter[]>;
  searchNewsletters(query: string): Promise<Newsletter[]>;
  importNewsletters(newsletters: InsertNewsletter[]): Promise<void>;
  importNewsletter(newsletter: InsertNewsletter): Promise<void>;
  updateNewsletterDetails(id: number, updates: Partial<InsertNewsletter>): Promise<void>;
  addSubscription(subscription: InsertSubscription): Promise<void>;
  getSubscriptions(): Promise<Subscription[]>;
  getActiveSubscriptions(): Promise<Subscription[]>;
}

export class DatabaseStorage implements IStorage {
  async getNewsletters(): Promise<Newsletter[]> {
    return await db.select().from(newsletters).orderBy(desc(newsletters.date));
  }

  async getNewslettersWithoutDetails(): Promise<Newsletter[]> {
    return await db
      .select()
      .from(newsletters)
      .where(eq(newsletters.hasDetails, false))
      .orderBy(desc(newsletters.date));
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

  async importNewsletter(newsletter: InsertNewsletter): Promise<void> {
    try {
      await db.insert(newsletters).values(newsletter);
    } catch (error: any) {
      if (error.code === '23505') { // PostgreSQL unique violation code
        console.log(`Newsletter with URL ${newsletter.url} already exists, skipping`);
      } else {
        throw error;
      }
    }
  }

  async importNewsletters(newNewsletters: InsertNewsletter[]): Promise<void> {
    for (const newsletter of newNewsletters) {
      await this.importNewsletter(newsletter);
    }
  }

  async updateNewsletterDetails(id: number, updates: Partial<InsertNewsletter>): Promise<void> {
    await db
      .update(newsletters)
      .set({
        ...updates,
        last_checked: new Date(),
      })
      .where(eq(newsletters.id, id));
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
      .leftJoin(
        notificationSettings,
        eq(subscriptions.id, notificationSettings.subscription_id)
      )
      .where(eq(notificationSettings.newsletter_notifications, true));

    return result.map(r => r.subscription);
  }
}

export const storage = new DatabaseStorage();