import axios from "axios";
import * as cheerio from "cheerio";

// Configuration
const baseUrl = "https://sinhala.newsfirst.lk/news";
const headers = {
  "User-Agent": "NewsScraper/1.0 (contact: your-email@example.com)",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
};
let seenUrls = new Set(); // Track articles (reset per invocation)

// Function to delay execution
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Scrape function
async function scrapeNews(page = 1, type = "latest") {
  const url = `${baseUrl}?page=${page}&nocache=${Math.floor(Math.random() * 10000)}`;
  const data = { articles: [] };
  try {
    const response = await axios.get(url, { headers, timeout: 10000 });
    const $ = cheerio.load(response.data);

    // Find articles (adjust selectors based on site’s HTML)
    const articles = $("article"); // Inspect HTML for correct tag/class
    for (const article of articles) {
      try {
        const title = $(article).find("h2").text().trim() || "N/A"; // Adjust selector
        const description = $(article).find("div.article-body").text().trim() || "N/A"; // Adjust for full text
        let link = $(article).find("a").attr("href") || "N/A";
        if (link !== "N/A" && !link.startsWith("http")) {
          link = `https://sinhala.newsfirst.lk${link}`;
        }
        const date = $(article).find("time").text().trim() || "N/A";
        const category = $(article).find("span.category").text().trim() || type; // Use query type as fallback
        const image = $(article).find("img").attr("src") || "N/A";
        const additionalImages = $(article)
          .find("img.additional-image")
          .map((i, img) => $(img).attr("src"))
          .get();

        // Only add new articles
        if (link !== "N/A" && !seenUrls.has(link)) {
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
    console.log(`Scraped page ${page} for type: ${type}`);
    return data.articles;
  } catch (error) {
    console.error(`Error fetching page ${page}: ${error.message}`);
    return [];
  }
}

// Vercel handler
export default async function handler(req, res) {
  try {
    const { type = "latest" } = req.query; // Get type from query (latest or local)
    seenUrls = new Set(); // Reset seenUrls for each request

    // Scrape 2 pages (adjust as needed)
    let articles = [];
    for (let page = 1; page <= 2; page++) {
      const pageArticles = await scrapeNews(page, type);
      articles = [...articles, ...pageArticles];
      await delay(2000); // 2-second delay between pages
    }

    // Filter articles by type (basic example, adjust logic as needed)
    const filteredArticles = type === "local"
      ? articles.filter(article => article.category.toLowerCase().includes("local") || article.description.includes("Sri Lanka"))
      : articles; // Return all for "latest"

    // Return JSON response
    res.status(200).json({
      status: "success",
      articles: filteredArticles,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`Handler error: ${error.message}`);
    res.status(500).json({
      status: "error",
      message: "Failed to scrape news",
      error: error.message,
    });
  }
}
