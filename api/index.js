const axios = require('axios');
const cheerio = require('cheerio');

// Helper function to fetch full article description
const fetchArticleDescription = async (articleUrl) => {
  try {
    const { data } = await axios.get(articleUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 5000
    });
    
    const $ = cheerio.load(data);
    // Extract from article body paragraphs, excluding unwanted elements
    const paragraphs = $('.article-body, .content, .post-content, p')
      .not('.read-more, a, button, .button, [class*="more"], [class*="button"]') // Exclude buttons/links
      .map((i, el) => $(el).text().trim())
      .get()
      .filter(text => text && 
        text.length > 20 && 
        !text.includes('COLOMBO (News1st)') && 
        !text.includes('ශ්‍රී ලංකා ප්‍රවෘත්ති') && 
        !text.includes('වැඩි විස්තර කියවන්න') && // Exclude "Read More"
        !text.match(/^\d{1,2}-\d{1,2}-\d{4}/)); // Exclude timestamps
    let description = paragraphs.join(' ').substring(0, 1000); // Increased limit for fuller content
    
    // Fallback to meta description if no paragraphs found, but clean it
    if (!description) {
      description = $('meta[name="description"]').attr('content')?.trim() || '';
      if (description.includes('ශ්‍රී ලංකා ප්‍රවෘත්ති') || description.includes('වැඩි විස්තර කියවන්න')) {
        description = ''; // Discard generic meta description or button text
      }
    }
    
    return description || 'No description available';
  } catch (error) {
    console.log(`Failed to fetch description from ${articleUrl}: ${error.message}`);
    return 'No description available';
  }
};

module.exports = async (req, res) => {
  try {
    const type = req.query.type || 'latest';
    const fetchDescriptions = req.query.descriptions === 'true'; // Optional flag for full descriptions
    const url = type === 'local' 
      ? 'https://sinhala.newsfirst.lk/local' 
      : 'https://sinhala.newsfirst.lk/latest-news';

    console.log(`Scraping URL: ${url}, Fetch descriptions: ${fetchDescriptions}`);

    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 10000
    });

    const $ = cheerio.load(data);
    const newsItems = [];

    // Updated selectors for news items
    const selectors = [
      '.news-item', '.article-item', '.post-item', '.news-card', '.article-card',
      '.story-item', '.content-item', 'article', '.article', '.post', '.story',
      '.content', 'li[class*="news"]', 'li[class*="article"]', 'li[class*="post"]',
      'div[class*="news"]', 'div[class*="article"]', 'div[class*="post"]',
      'div[class*="story"]', 'div[class*="item"]'
    ];

    for (const selector of selectors) {
      $(selector).each((i, element) => {
        if (newsItems.length >= 20) return false; // Limit to 20 items

        const $element = $(element);
        
        // Extract title/topic
        const titleSelectors = [
          'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
          '.title', '.headline', '.news-title', '.article-title', '.story-title',
          'a[title]', 'a'
        ];
        
        let topic = '';
        for (const titleSel of titleSelectors) {
          const titleEl = $element.find(titleSel).first();
          if (titleEl.length) {
            topic = titleEl.attr('title') || titleEl.text().trim();
            if (topic && topic.length > 10) break;
          }
        }

        // Extract article URL
        let articleUrl = '';
        const articleLink = $element.find('a[href]').first();
        if (articleLink.length) {
          const href = articleLink.attr('href');
          articleUrl = href.startsWith('http') ? href : 
                      href.startsWith('/') ? `https://sinhala.newsfirst.lk${href}` :
                      `https://sinhala.newsfirst.lk/${href}`;
        }

        // Extract description from main page
        let description = '';
        const descSelectors = [
          'p', '.summary', '.excerpt', '.description', '.content', '.text', '.lead',
          '.news-summary', '.article-summary', '.story-summary', '.story-content',
          '.article-content', '.news-content', '.post-content'
        ];
        
        for (const descSel of descSelectors) {
          const descEl = $element.find(descSel).not(':has(h1, h2, h3, h4, h5, h6, a.read-more, button, .button, [class*="more"])').first();
          if (descEl.length) {
            const text = descEl.text().trim();
            if (text && text.length > 20 && text !== topic && 
                !text.includes('COLOMBO (News1st)') && 
                !text.includes('ශ්‍රී ලංකා ප්‍රවෘත්ති') && 
                !text.includes('වැඩි විස්තර කියවන්න')) {
              description = text;
              break;
            }
          }
        }

        // Fallback: Extract text after title, excluding bylines and buttons
        if (!description) {
          const allText = $element.text().trim();
          const parts = allText.split(topic);
          if (parts.length > 1) {
            let afterTitle = parts[1].trim();
            if (afterTitle && afterTitle.length > 20) {
              afterTitle = afterTitle.replace(/COLOMBO\s*\([^)]+\)\s*[-–]\s*/i, '')
                                    .replace(/ශ්‍රී ලංකා ප්‍රවෘත්ති.*$/, '')
                                    .replace(/වැඩි විස්තර කියවන්න.*$/, '') // Exclude "Read More"
                                    .replace(/^\d{1,2}-\d{1,2}-\d{4}.*$/, '');
              if (afterTitle.length > 20) {
                description = afterTitle.substring(0, 300);
              }
            }
          }
        }

        // Clean up description
        if (description) {
          description = description
            .replace(/COLOMBO\s*\([^)]+\)\s*[-–]\s*/i, '')
            .replace(/ශ්‍රී ලංකා ප්‍රවෘත්ති.*$/, '')
            .replace(/වැඩි විස්තර කියවන්න.*$/, '')
            .replace(/^\d{1,2}-\d{1,2}-\d{4}.*$/, '')
            .replace(/\s+/g, ' ')
            .trim();
        }

        // Extract image
        const img = $element.find('img').first();
        let imageUrl = '';
        if (img.length) {
          imageUrl = img.attr('src') || img.attr('data-src') || img.attr('data-lazy-src') || '';
          if (imageUrl && !imageUrl.startsWith('http') && !imageUrl.startsWith('data:')) {
            imageUrl = imageUrl.startsWith('/') 
              ? `https://sinhala.newsfirst.lk${imageUrl}`
              : `https://sinhala.newsfirst.lk/${imageUrl}`;
          }
        }

        // Add item if title is valid
        if (topic && topic.length > 5) {
          newsItems.push({
            topic: topic.substring(0, 200),
            description: description || 'No description available',
            image_url: imageUrl || '',
            article_url: articleUrl || ''
          });
        }
      });

      if (newsItems.length > 0) {
        console.log(`Found ${newsItems.length} items using selector: ${selector}`);
        break;
      }
    }

    // Aggressive approach if no items found
    if (newsItems.length === 0) {
      console.log('No items found with standard selectors, trying aggressive approach...');
      
      $('a, h1, h2, h3, h4, h5, h6, .title, [class*="title"], [class*="headline"]').each((i, element) => {
        if (newsItems.length >= 10) return false;
        
        const $element = $(element);
        const text = $element.text().trim();
        
        if (text.length > 15 && text.length < 200) {
          const $parent = $element.closest('div, article, li, section');
          let description = $parent.find('p').not('.read-more, a, button, .button, [class*="more"]').first().text().trim();
          
          if (description) {
            description = description
              .replace(/COLOMBO\s*\([^)]+\)\s*[-–]\s*/i, '')
              .replace(/ශ්‍රී ලංකා ප්‍රවෘත්ති.*$/, '')
              .replace(/වැඩි විස්තර කියවන්න.*$/, '')
              .replace(/^\d{1,2}-\d{1,2}-\d{4}.*$/, '')
              .replace(/\s+/g, ' ')
              .trim();
          }
          
          const img = $parent.find('img').first();
          let imageUrl = '';
          if (img.length) {
            imageUrl = img.attr('src') || img.attr('data-src') || '';
            if (imageUrl && !imageUrl.startsWith('http')) {
              imageUrl = imageUrl.startsWith('/') 
                ? `https://sinhala.newsfirst.lk${imageUrl}`
                : `https://sinhala.newsfirst.lk/${imageUrl}`;
            }
          }
          
          const articleLink = $element.is('a') ? $element : $parent.find('a[href]').first();
          const articleUrl = articleLink.length ? (articleLink.attr('href').startsWith('http') ? 
            articleLink.attr('href') : `https://sinhala.newsfirst.lk${articleLink.attr('href')}`) : '';
          
          newsItems.push({
            topic: text,
            description: description || 'No description available',
            image_url: imageUrl || '',
            article_url: articleUrl || ''
          });
        }
      });
    }

    // Remove duplicates based on topic
    const uniqueItems = newsItems.filter((item, index, self) => 
      index === self.findIndex(i => i.topic === item.topic)
    );

    // Fetch full descriptions from article pages
    console.log('Fetching full descriptions for articles...');
    
    const promises = uniqueItems.slice(0, 5).map(async (item, index) => {
      if (item.article_url) {
        await new Promise(resolve => setTimeout(resolve, index * 1000)); // Delay to avoid rate-limiting
        const fullDescription = await fetchArticleDescription(item.article_url);
        item.description = fullDescription.substring(0, 1000);
      }
      return item;
    });
    
    const itemsWithDescriptions = await Promise.all(promises);
    const finalItems = [...itemsWithDescriptions, ...uniqueItems.slice(5)];
    
    console.log(`Fetched descriptions for ${itemsWithDescriptions.filter(item => item.description !== 'No description available').length} articles`);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.status(200).json(finalItems);

  } catch (error) {
    console.error('Scraping error:', error.message);
    res.status(500).json({ 
      error: 'Failed to scrape news', 
      details: error.message,
      url: req.query.type === 'local' ? 'https://sinhala.newsfirst.lk/local' : 'https://sinhala.newsfirst.lk/latest-news'
    });
  }
};
