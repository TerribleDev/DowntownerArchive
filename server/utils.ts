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

    if (!data) {
      console.error('No data received from Robly');
      throw new Error('No data received from archive URL');
    }

    console.log('Received HTML response:', data.slice(0, 200)); // Log first 200 chars for debugging

    const $ = cheerio.load(data);
    const newsletters: InsertNewsletter[] = [];

    // Find all rows in the archive table
    $('tr').each((_, element) => {
      const $element = $(element);

      // Extract newsletter details
      const title = $element.find('td').first().text().trim();
      const dateText = $element.find('td').eq(1).text().trim();
      const url = $element.find('a').attr('href');

      console.log('Found row:', { title, dateText, url }); // Debug log

      if (title && dateText && url) {
        try {
          // Parse the date (format: MM/DD/YYYY)
          const [month, day, year] = dateText.split('/').map(num => num.trim());
          if (!month || !day || !year) {
            console.warn('Invalid date format:', dateText);
            return;
          }

          const date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

          newsletters.push({
            title,
            date,
            url: url.startsWith('http') ? url : `https://app.robly.com${url}`,
            description: null
          });
        } catch (err) {
          console.warn('Error processing newsletter row:', err);
        }
      }
    });

    if (newsletters.length === 0) {
      console.error('No newsletters found in HTML:', data);
      throw new Error('No newsletters found in the archive');
    }

    console.log('Successfully scraped newsletters:', newsletters.length);
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