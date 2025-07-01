import requests
from bs4 import BeautifulSoup
import time
import json

# Define headers to identify your scraper
headers = {"User-Agent": "NewsScraper/1.0 (contact: your-email@example.com)"}

# Target news page (adjust URL based on site structure)
url = "https://english.newsfirst.lk/news"

# Send request
response = requests.get(url, headers=headers)
soup = BeautifulSoup(response.text, "html.parser")

# Find article elements (inspect site’s HTML to identify correct tags/classes)
articles = soup.find_all("article")  # Adjust based on newsfirst.lk’s structure
data = {"articles": []}

for article in articles:
    try:
        title = article.find("h2").text.strip()  # Adjust tag/class
        description = article.find("div", class_="article-body").text.strip()  # Adjust for full text
        link = article.find("a")["href"]
        date = article.find("time").text.strip()  # Adjust for date
        category = article.find("span", class_="category").text.strip()  # Adjust for category
        data["articles"].append({
            "title": title,
            "description": description,
            "url": link,
            "date": date,
            "category": category
        })
    except AttributeError:
        continue  # Skip articles with missing data
    time.sleep(1)  # Respect server with 1-second delay

# Save to JSON
with open("newsfirst_articles.json", "w") as f:
    json.dump(data, f, indent=2)

print("Scraping complete. Data saved to newsfirst_articles.json")
