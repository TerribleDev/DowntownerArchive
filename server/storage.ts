import { type Newsletter, type InsertNewsletter } from "@shared/schema";

export interface IStorage {
  getNewsletters(): Promise<Newsletter[]>;
  searchNewsletters(query: string): Promise<Newsletter[]>;
}

export class MemStorage implements IStorage {
  private newsletters: Newsletter[];

  constructor() {
    // Sample data - in production this would come from a database
    this.newsletters = [
      {
        id: 1,
        title: "December 2023 Edition",
        date: new Date("2023-12-01"),
        url: "https://app.robly.com/archive?id=dec2023",
        description: "End of year celebrations in Downtown Nashua"
      },
      {
        id: 2,
        title: "November 2023 Edition",
        date: new Date("2023-11-01"),
        url: "https://app.robly.com/archive?id=nov2023",
        description: "Fall events and holiday preparations"
      },
      // Add more sample newsletters as needed
    ];
  }

  async getNewsletters(): Promise<Newsletter[]> {
    return this.newsletters.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  async searchNewsletters(query: string): Promise<Newsletter[]> {
    const lowercaseQuery = query.toLowerCase();
    return this.newsletters.filter(
      newsletter =>
        newsletter.title.toLowerCase().includes(lowercaseQuery) ||
        newsletter.description?.toLowerCase().includes(lowercaseQuery)
    ).sort((a, b) => b.date.getTime() - a.date.getTime());
  }
}

export const storage = new MemStorage();
