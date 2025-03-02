import { useState, useEffect, useRef, useCallback } from "react";
import { format } from "date-fns";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { urlBase64ToUint8Array } from "@/lib/utils";
import {
  Search,
  ExternalLink,
  Calendar,
  RefreshCw,
  Share2,
  Twitter,
  Facebook,
  Rss,
  Bell,
  BellOff,
} from "lucide-react";
import { useNewsletters, useNewsletterSearch, type NewslettersResponse } from "@/lib/newsletter-data";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { motion, AnimatePresence } from "framer-motion";
import type { Newsletter } from "@shared/schema";

const ITEMS_PER_PAGE = 20;

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [page, setPage] = useState(1);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [allItems, setAllItems] = useState<Newsletter[]>([]);
  const loader = useRef<HTMLDivElement>(null);

  const {
    data: newslettersData,
    isLoading,
    isFetching,
  } = useNewsletters(page, ITEMS_PER_PAGE);

  const {
    data: searchData,
    isLoading: isSearchLoading,
    isFetching: isSearchFetching,
  } = useNewsletterSearch(searchQuery, page, ITEMS_PER_PAGE);

  const { toast } = useToast();
  const isDevelopment = import.meta.env.MODE === "development";

  // Determine which data source to use and calculate hasMorePages
  const currentData = searchQuery ? searchData : newslettersData;
  const isCurrentLoading = searchQuery ? isSearchLoading : isLoading;
  const isCurrentFetching = searchQuery ? isSearchFetching : isFetching;

  // Check if there are more pages to load
  const hasMorePages = currentData ? 
    (currentData.page * currentData.limit < currentData.total) : false;

  // Merge newsletter items when data changes
  useEffect(() => {
    if (!currentData) return;

    if (page === 1) {
      // Reset items if we're back at page 1 (e.g., after a new search)
      setAllItems(currentData.newsletters);
    } else {
      // Merge items, ensuring we don't have duplicates
      setAllItems(prevItems => {
        // Create a set of IDs from new items for faster lookups
        const newItemIds = new Set(currentData.newsletters.map(item => item.id));

        // Filter out any previous items that would be duplicated
        const filteredPrevItems = prevItems.filter(item => !newItemIds.has(item.id));

        // Combine previous (non-duplicate) items with new items
        return [...filteredPrevItems, ...currentData.newsletters];
      });
    }
  }, [currentData, page]);

  // Reset to page 1 when search query changes
  useEffect(() => {
    setPage(1);
    setAllItems([]);
  }, [searchQuery]);

  const handleImport = async () => {
    try {
      setIsImporting(true);
      const response = await apiRequest("POST", "/api/newsletters/import");
      toast({
        title: "Success",
        description: response.message,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to import newsletters",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleTestNotification = async () => {
    try {
      const response = await apiRequest("POST", "/api/notifications/test");
      toast({
        title: "Notifications Sent",
        description: `${response.message} (${response.totalSubscribers} subscribers)`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send test notifications",
        variant: "destructive",
      });
    }
  };

  const handleShare = async (newsletter: Newsletter) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: newsletter.title,
          text:
            newsletter.description ||
            "Check out this newsletter from The Downtowner",
          url: newsletter.url,
        });
      } catch (error: any) {
        if (error.name !== "AbortError") {
          toast({
            title: "Error",
            description: "Failed to share newsletter",
            variant: "destructive",
          });
        }
      }
    }
  };

  const handleSubscribe = async () => {
    try {
      if (!("serviceWorker" in navigator) || !("Notification" in window)) {
        throw new Error("Push notifications are not supported");
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("Notification permission denied");
      }

      console.log("Getting service worker registration...");
      const registration = await navigator.serviceWorker.ready;
      console.log("Service worker registered successfully");

      const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        throw new Error("VAPID public key is not configured");
      }
      console.log(
        "VAPID public key available:",
        vapidPublicKey.slice(0, 10) + "...",
      );

      const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);
      console.log("Converted VAPID key length:", convertedVapidKey.length);
      console.log(
        "First few bytes:",
        Array.from(convertedVapidKey.slice(0, 5)),
      );

      console.log("Requesting push subscription...");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey,
      });
      console.log("Successfully subscribed to push notifications");

      console.log("Sending subscription to server...");
      await apiRequest("POST", "/api/subscriptions", subscription);
      setIsSubscribed(true);
      toast({
        title: "Subscribed!",
        description: "You'll receive notifications for new newsletters",
      });
    } catch (error: any) {
      console.error("Subscription error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to subscribe to notifications",
        variant: "destructive",
      });
    }
  };

  const handleObserver = useCallback((entries: IntersectionObserverEntry[]) => {
    const target = entries[0];
    if (target.isIntersecting && !isCurrentLoading && !isCurrentFetching && hasMorePages) {
      console.log("Loading more newsletters. Current page:", page);
      setPage((prev) => prev + 1);
    }
  }, [isCurrentLoading, isCurrentFetching, hasMorePages, page]);

  useEffect(() => {
    const currentLoader = loader.current;
    const observer = new IntersectionObserver(handleObserver, {
      root: null,
      rootMargin: "100px",
      threshold: 0.1,
    });

    if (currentLoader) {
      observer.observe(currentLoader);
    }

    return () => {
      if (currentLoader) {
        observer.unobserve(currentLoader);
      }
    };
  }, [handleObserver]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <motion.header
          className="mb-8 text-center"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
            The Downtowner
          </h1>
          <p className="text-muted-foreground text-lg mb-6">
            Newsletter Archive for Downtown Nashua
          </p>

          <div className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto items-center">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search newsletters..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            {isDevelopment && (
              <Button
                variant="outline"
                size="icon"
                onClick={handleImport}
                disabled={isImporting}
              >
                <RefreshCw
                  className={`h-4 w-4 ${isImporting ? "animate-spin" : ""}`}
                />
              </Button>
            )}
            {isDevelopment && (
              <Button variant="outline" size="icon" onClick={handleTestNotification}>
                Test Notification
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              onClick={handleSubscribe}
              disabled={isSubscribed}
            >
              {isSubscribed ? (
                <BellOff className="h-4 w-4" />
              ) : (
                <Bell className="h-4 w-4" />
              )}
            </Button>
            <Button variant="outline" size="icon" asChild>
              <a href="/api/rss" target="_blank" rel="noopener noreferrer">
                <Rss className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </motion.header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {isCurrentLoading && page === 1 ? (
              Array(6)
                .fill(0)
                .map((_, i) => (
                  <motion.div
                    key={`skeleton-${i}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <Card className="hover:shadow-lg transition-shadow h-full">
                      <CardHeader>
                        <Skeleton className="h-6 w-2/3" />
                        <Skeleton className="h-4 w-1/2" />
                      </CardHeader>
                      <CardContent>
                        <Skeleton className="h-4 w-full" />
                      </CardContent>
                    </Card>
                  </motion.div>
                ))
            ) : allItems && allItems.length > 0 ? (
              allItems.map((newsletter) => (
                <motion.div
                  key={newsletter.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  layout
                >
                  <a
                    href={newsletter.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <Card className="h-full hover:shadow-lg transition-all duration-300 cursor-pointer group h-full">
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between gap-2">
                          <span className="line-clamp-2 flex-1">
                            {newsletter.title}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleShare(newsletter);
                              }}
                            >
                              <Share2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                window.open(newsletter.url, "_blank");
                              }}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardTitle>
                        <CardDescription className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {format(new Date(newsletter.date), "MMMM d, yyyy")}
                        </CardDescription>
                      </CardHeader>
                      {(newsletter.thumbnail || newsletter.description) && (
                        <CardContent>
                          {newsletter.thumbnail && (
                            <img
                              src={newsletter.thumbnail}
                              alt={newsletter.title}
                              className="w-full h-40 object-cover rounded-md mb-4"
                            />
                          )}
                          {newsletter.description && (
                            <p className="text-muted-foreground line-clamp-3">
                              {newsletter.description}
                            </p>
                          )}
                        </CardContent>
                      )}
                    </Card>
                  </a>
                </motion.div>
              ))
            ) : (
              <div className="col-span-full text-center py-12 text-muted-foreground">
                No newsletters found matching your search.
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Loading indicator at bottom */}
        {hasMorePages && (
          <div ref={loader} className="h-20 my-4 flex justify-center items-center">
            {isCurrentFetching && page > 1 && (
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}