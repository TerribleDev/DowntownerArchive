import { useQuery } from "@tanstack/react-query";
import type { Newsletter } from "@shared/schema";

export interface Newsletter {
  // ... other properties
  thumbnail: string | null;
}

export function useNewsletters() {
  return useQuery<Newsletter[]>({ 
    queryKey: ['/api/newsletters']
  });
}

export function useNewsletterSearch(query: string) {
  return useQuery<Newsletter[]>({ 
    queryKey: ['/api/newsletters/search', query],
    enabled: query.length > 0
  });
}