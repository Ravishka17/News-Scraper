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

    $('.news-item').each((i, element) => {
      const topic = $(element).find('.title').text().trim();
      const description = $(element).find('.summary').text().trim();
      const imageUrl = $(element).find('.thumbnail').attr('src') || '';

      if (topic && description) {
        newsItems.push({
          topic,
          description,
          image_url: imageUrl.startsWith('http') ? imageUrl : `https://sinhala.newsfirst.lk${imageUrl}`
        });
      }
    });

    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(newsItems);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to scrape news' });
  }
};
