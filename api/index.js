import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs/promises";
import { join } from "path";

// Configuration
const baseUrl = "https://sinhala.newsfirst.lk/news";
const headers = {
  "User-Agent": "NewsScraper/1.0 (contact: your-email@example.com)",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
};
const seenUrls = new Set(); // Track processed articles
const data = { articles: [] };

// Function to delay execution
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Scrape function
async function scrapeNews(page = 1) {
  const url = `${baseUrl}?page=${page}&nocache=${Math.floor(Math.random() * 10000)}`;
  try {
    const response = await axios.get(url, { headers, timeout: 10000 });
    const $ = cheerio.load(response.data);

    // Find articles (adjust selectors based on site’s HTML)
    const articles = $("article"); // Inspect HTML for correct tag/class
    for (const article of articles) {
      try {
        const title = $(article).find("h2").text().trim(); // Adjust selector
        const description = $(article).find("div.article-body").text().trim(); // Adjust for full text
        let link = $(article).find("a").attr("href");
        if (!link.startsWith("http")) {
          link = `https://sinhala.newsfirst.lk${link}`;
        }
        const date = $(article).find("time").text().trim() || "N/A";
        const category = $(article).find("span.category").text().trim() || "N/A";
        const image = $(article).find("img").attr("src") || "N/A";
        const additionalImages = $(article)
          .find("img.additional-image")
          .map((i, img) => $(img).attr("src"))
          .get();

        // Only add new articles
        if (!seenUrls.has(link)) {
          seenUrls.add(link);
          data.articles.push({
            topic: title,
            description,
            image_url: image,
            article_url: link,
            date,
            category,
            additional_images: additionalImages,
          });
        }
      } catch (error) {
        console.error(`Error processing article: ${error.message}`);
      }
      await delay(1000); // 1-second delay between articles
    }
    console.log(`Scraped page ${page}`);
  } catch (error) {
    console.error(`Error fetching page ${page}: ${error.message}`);
  }
}

// Main function to scrape multiple pages
async function main() {
  // Scrape first 2 pages (adjust as needed)
  for (let page = 1; page <= 2; page++) {
    await scrapeNews(page);
    await delay(2000); // 2-second delay between pages
  }

  // Save output with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = join(process.cwd(), `newsfirst_articles_${timestamp}.json`);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
  console.log(`Scraping complete. Saved to ${filePath}`);
}

// Run scraper
main().catch((error) => {
  console.error(`Main error: ${error.message}`);
  process.exit(1);
});
