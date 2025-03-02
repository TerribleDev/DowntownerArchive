
import { useQuery } from "@tanstack/react-query";
import type { Newsletter } from "@shared/schema";

interface NewslettersResponse {
  newsletters: Newsletter[];
  total: number;
  page: number;
  limit: number;
}

export function useNewsletters(page = 1, limit = 20) {
  return useQuery<NewslettersResponse>({ 
    queryKey: ['/api/newsletters', page, limit],
    queryFn: async () => {
      const response = await fetch(`/api/newsletters?page=${page}&limit=${limit}`);
      return response.json();
    }
  });
}

export function useNewsletterSearch(query: string, page = 1, limit = 20) {
  return useQuery<NewslettersResponse>({ 
    queryKey: ['/api/newsletters/search', query, page, limit],
    queryFn: async () => {
      const response = await fetch(`/api/newsletters/search?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`);
      return response.json();
    },
    enabled: query.length > 0
  });
}
