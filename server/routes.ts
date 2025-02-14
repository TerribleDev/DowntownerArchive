import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { scrapeNewsletters } from "./utils";

export async function registerRoutes(app: Express): Promise<Server> {
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

  const httpServer = createServer(app);
  return httpServer;
}