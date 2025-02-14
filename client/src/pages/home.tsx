import { useState } from "react";
import { format } from "date-fns";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, ExternalLink, Calendar } from "lucide-react";
import { useNewsletters, useNewsletterSearch } from "@/lib/newsletter-data";

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const { data: allNewsletters, isLoading } = useNewsletters();
  const { data: searchResults } = useNewsletterSearch(searchQuery);

  const newsletters = searchQuery ? searchResults : allNewsletters;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <header className="mb-8 text-center">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
            The Downtowner
          </h1>
          <p className="text-muted-foreground text-lg mb-6">
            Newsletter Archive for Downtown Nashua
          </p>
          
          <div className="relative max-w-md mx-auto">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search newsletters..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {isLoading ? (
            Array(6).fill(0).map((_, i) => (
              <Card key={i} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <Skeleton className="h-6 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full" />
                </CardContent>
              </Card>
            ))
          ) : newsletters?.length ? (
            newsletters.map((newsletter) => (
              <a
                key={newsletter.id}
                href={newsletter.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer group">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      {newsletter.title}
                      <ExternalLink className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </CardTitle>
                    <CardDescription className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {format(new Date(newsletter.date), 'MMMM d, yyyy')}
                    </CardDescription>
                  </CardHeader>
                  {newsletter.description && (
                    <CardContent>
                      <p className="text-muted-foreground">
                        {newsletter.description}
                      </p>
                    </CardContent>
                  )}
                </Card>
              </a>
            ))
          ) : (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              No newsletters found matching your search.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
