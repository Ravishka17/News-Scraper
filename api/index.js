const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  try {
    const type = req.query.type || 'latest';
    const url = type === 'local' 
      ? 'https://sinhala.newsfirst.lk/local' 
      : 'https://sinhala.newsfirst.lk/latest-news';

    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const $ = cheerio.load(data);
    const newsItems = [];

    // Try common selectors for news articles
    $('article, .article, .news-item, .article-card, .post').each((i, element) => {
      const topic = $(element).find('h2, h3, .title, .article-title, a').first().text().trim();
      const description = $(element).find('p, .summary, .excerpt, .description').first().text().trim();
      const imageUrl = $(element).find('img').attr('src') || $(element).find('img').attr('data-src') || '';

      if (topic) {
        newsItems.push({
          topic,
          description: description || 'No description available',
          image_url: imageUrl.startsWith('http') ? imageUrl : `https://sinhala.newsfirst.lk${imageUrl}`
        });
      }
    });

    // Log for debugging
    if (newsItems.length === 0) {
      console.log('No news items found. HTML sample:', $('body').html().slice(0, 500));
    }

    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(newsItems);
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: 'Failed to scrape news', details: error.message });
  }
};
