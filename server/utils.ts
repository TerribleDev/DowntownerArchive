import axios from 'axios';
import * as cheerio from 'cheerio';
import type { InsertNewsletter } from '@shared/schema';

const ROBLY_ARCHIVE_URL = 'https://app.robly.com/public/archives?a=b31b32385b5904b5';

export async function scrapeNewsletters(): Promise<InsertNewsletter[]> {
  try {
    // Add headers to mimic a browser request
    const { data } = await axios.get(ROBLY_ARCHIVE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout: 10000 // 10 second timeout
    });

    const $ = cheerio.load(data);
    const newsletters: InsertNewsletter[] = [];

    // Find all links that start with /archive?id=
    $('a[href^="/archive?id="]').each((_, element) => {
      const $element = $(element);
      const url = $element.attr('href');
      const fullText = $element.parent().text().trim();

      // Extract date and title from the text
      // Format is typically: "March 21, 2017 - Title"
      const match = fullText.match(/^([A-Za-z]+ \d{1,2}, \d{4}) - (.+)$/);

      if (match && url) {
        const [, dateStr, title] = match;
        try {
          const date = new Date(dateStr).toISOString().split('T')[0];

          newsletters.push({
            title: title.trim(),
            date,
            url: `https://app.robly.com${url}`,
            description: null
          });
        } catch (err) {
          console.warn('Error processing date for newsletter:', { dateStr, title }, err);
        }
      }
    });

    if (newsletters.length === 0) {
      console.error('No newsletters found in HTML. First 500 chars of response:', data.slice(0, 500));
      throw new Error('No newsletters found in the archive');
    }

    console.log(`Successfully scraped ${newsletters.length} newsletters`);
    return newsletters;

  } catch (error) {
    console.error('Error scraping newsletters:', error);
    if (axios.isAxiosError(error)) {
      console.error('Axios error details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
    }
    throw error;
  }
}