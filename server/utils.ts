import axios from 'axios';
import * as cheerio from 'cheerio';
import type { InsertNewsletter } from '@shared/schema';

const ROBLY_ARCHIVE_URL = 'https://app.robly.com/public/archives?a=b31b32385b5904b5';

async function scrapeNewsletterContent(url: string) {
  try {
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout: 15000
    });

    const $ = cheerio.load(data);

    // Get the second image as thumbnail
    const images = $('img').toArray();
    const thumbnailUrl = images.length > 1 ? $(images[1]).attr('src') : null;

    // Extract text content
    const content = $('body').text().trim();

    return {
      thumbnail: thumbnailUrl,
      content
    };
  } catch (error) {
    console.warn('Error scraping newsletter content:', error);
    return { thumbnail: null, content: null };
  }
}

export async function scrapeNewsletters(): Promise<InsertNewsletter[]> {
  try {
    const { data } = await axios.get(ROBLY_ARCHIVE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout: 10000
    });

    const $ = cheerio.load(data);
    const newsletters: InsertNewsletter[] = [];

    // Find all links that start with /archive?id=
    const links = $('a[href^="/archive?id="]');
    console.log(`Found ${links.length} newsletter links`);

    for (const element of links.toArray()) {
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
          const fullUrl = `https://app.robly.com${url}`;

          // Scrape the newsletter content
          const { thumbnail, content } = await scrapeNewsletterContent(fullUrl);

          newsletters.push({
            title: title.trim(),
            date,
            url: fullUrl,
            thumbnail,
            content,
            description: content ? content.slice(0, 200) + '...' : null
          });

          console.log(`Processed newsletter: ${title}`);
        } catch (err) {
          console.warn('Error processing date for newsletter:', { dateStr, title }, err);
        }
      }
    }

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