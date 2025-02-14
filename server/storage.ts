import { type Newsletter, type InsertNewsletter } from "@shared/schema";

export interface IStorage {
  getNewsletters(): Promise<Newsletter[]>;
  searchNewsletters(query: string): Promise<Newsletter[]>;
  importNewsletters(newsletters: InsertNewsletter[]): Promise<void>;
}

export class MemStorage implements IStorage {
  private newsletters: Newsletter[];
  private currentId: number;

  constructor() {
    this.newsletters = [];
    this.currentId = 1;
  }

  async getNewsletters(): Promise<Newsletter[]> {
    return this.newsletters.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  async searchNewsletters(query: string): Promise<Newsletter[]> {
    const lowercaseQuery = query.toLowerCase();
    return this.newsletters.filter(
      newsletter =>
        newsletter.title.toLowerCase().includes(lowercaseQuery) ||
        (newsletter.description?.toLowerCase() || '').includes(lowercaseQuery)
    ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  async importNewsletters(newsletters: InsertNewsletter[]): Promise<void> {
    // Ensure description is null if not provided
    const processedNewsletters = newsletters.map(newsletter => ({
      ...newsletter,
      description: newsletter.description ?? null,
      id: this.currentId++
    }));

    this.newsletters.push(...processedNewsletters);
  }
}

export const storage = new MemStorage();