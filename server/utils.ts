import axios from 'axios';
import * as cheerio from 'cheerio';
import type { InsertNewsletter } from '@shared/schema';

const ROBLY_ARCHIVE_URL = 'https://app.robly.com/public/archives?a=b31b32385b5904b5';

export async function scrapeNewsletters(): Promise<InsertNewsletter[]> {
  try {
    const { data } = await axios.get(ROBLY_ARCHIVE_URL);
    const $ = cheerio.load(data);
    const newsletters: InsertNewsletter[] = [];

    // The main archive container table
    $('.archiveTable tr').each((_, element) => {
      const $element = $(element);

      // Extract newsletter details
      const title = $element.find('.archiveTitle').text().trim();
      const dateText = $element.find('.archiveDate').text().trim();
      const url = $element.find('a').attr('href');

      if (title && dateText && url) {
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
          url: `https://app.robly.com${url}`,
          description: null // Explicitly set to null as we don't have descriptions from the archive page
        });
      }
    });

    if (newsletters.length === 0) {
      throw new Error('No newsletters found in the archive');
    }

    return newsletters;
  } catch (error) {
    console.error('Error scraping newsletters:', error);
    throw error;
  }
}