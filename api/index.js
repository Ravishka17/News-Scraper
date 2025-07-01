import requests
from bs4 import BeautifulSoup
import time
import json
from datetime import datetime
import random

# Configuration
base_url = "https://sinhala.newsfirst.lk/news"
headers = {
    "User-Agent": f"NewsScraper/1.0 (contact: your-email@example.com)",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache"
}
seen_urls = set()  # Track processed articles (load from file/database if needed)
data = {"articles": []}

# Scrape multiple pages
for page in range(1, 3):  # Adjust page range as needed
    url = f"{base_url}?page={page}&nocache={random.randint(1, 10000)}"
    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()  # Raise error for bad responses
        soup = BeautifulSoup(response.text, "html.parser")

        # Find articles (adjust selectors based on site’s HTML)
        articles = soup.find_all("article")  # Inspect HTML for correct tag/class
        for article in articles:
            try:
                title = article.find("h2").text.strip()  # Adjust tag/class
                description = article.find("div", class_="article-body").text.strip()  # Adjust for full text
                link = article.find("a")["href"]
                if not link.startswith("http"):
                    link = f"https://sinhala.newsfirst.lk{link}"
                date = article.find("time").text.strip() if article.find("time") else "N/A"
                category = article.find("span", class_="category").text.strip() if article.find("span", class_="category") else "N/A"
                image = article.find("img")["src"] if article.find("img") else "N/A"
                additional_images = [img["src"] for img in article.find_all("img", class_="additional-image")] if article.find_all("img", class_="additional-image") else []

                # Only add new articles
                if link not in seen_urls:
                    seen_urls.add(link)
                    data["articles"].append({
                        "topic": title,
                        "description": description,
                        "image_url": image,
                        "article_url": link,
                        "date": date,
                        "category": category,
                        "additional_images": additional_images
                    })
            except (AttributeError, KeyError):
                continue  # Skip malformed articles
        time.sleep(1)  # Respect rate limits
    except requests.RequestException as e:
        print(f"Error fetching page {page}: {e}")
        continue

# Save output with timestamp
timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
with open(f"newsfirst_articles_{timestamp}.json", "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print(f"Scraping complete. Saved to newsfirst_articles_{timestamp}.json")
