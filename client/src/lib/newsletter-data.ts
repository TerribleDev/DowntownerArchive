import { useQuery } from "@tanstack/react-query";
import type { Newsletter } from "@shared/schema";

export interface NewslettersResponse {
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
      if (!response.ok) {
        throw new Error('Failed to fetch newsletters');
      }
      return response.json();
    },
    placeholderData: (previousData) => previousData
  });
}

export function useNewsletterSearch(query: string, page = 1, limit = 20) {
  return useQuery<NewslettersResponse>({ 
    queryKey: ['/api/newsletters/search', query, page, limit],
    queryFn: async () => {
      const response = await fetch(`/api/newsletters/search?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`);
      if (!response.ok) {
        throw new Error('Failed to search newsletters');
      }
      return response.json();
    },
    enabled: query.length > 0,
    placeholderData: (previousData) => previousData
  });
}