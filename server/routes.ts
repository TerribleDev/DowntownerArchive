import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";

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

  const httpServer = createServer(app);
  return httpServer;
}
