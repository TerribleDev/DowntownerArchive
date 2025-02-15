import { useQuery } from "@tanstack/react-query";
import type { Newsletter } from "@shared/schema";

function getProxiedImageUrl(url: string | null) {
  if (!url) return null;
  return `/api/proxy-image?url=${encodeURIComponent(url)}`;
}

export interface Newsletter {
  // ... other properties
  thumbnail: string | null;
}

export function useNewsletters() {
  return useQuery<Newsletter[]>({ 
    queryKey: ['/api/newsletters'],
    select: data => data.map(newsletter => ({
      ...newsletter,
      thumbnail: getProxiedImageUrl(newsletter.thumbnail)
    }))
  });
}

export function useNewsletterSearch(query: string) {
  return useQuery<Newsletter[]>({ 
    queryKey: ['/api/newsletters/search', query],
    enabled: query.length > 0,
    select: data => data.map(newsletter => ({
      ...newsletter,
      thumbnail: getProxiedImageUrl(newsletter.thumbnail)
    }))
  });
}