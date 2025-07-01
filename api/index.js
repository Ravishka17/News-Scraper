const axios = require('axios');
const cheerio = require('cheerio');

// Helper function to fetch article description from individual page
const fetchArticleDescription = async (articleUrl) => {
  try {
    const { data } = await axios.get(articleUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 5000
    });
    
    const $ = cheerio.load(data);
    // Try meta description first
    let description = $('meta[name="description"]').attr('content')?.trim();
    
    // If meta description is missing or too short, extract from article body
    if (!description || description.length < 50) {
      const paragraphs = $('.article-body, .content, p')
        .map((i, el) => $(el).text().trim())
        .get()
        .filter(text => text && text.length > 20 && !text.includes('COLOMBO (News1st)')); // Exclude bylines
      description = paragraphs.join(' ').substring(0, 400);
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
    const fetchDescriptions = req.query.descriptions === 'true'; // Add option to fetch full descriptions
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

    // Updated selectors based on provided HTML and common patterns
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
        
        // Try multiple ways to get the title/topic
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

        // Try to find description with improved selectors
        let description = '';
        const descSelectors = [
          'p', '.summary', '.excerpt', '.description', '.content', '.text', '.lead',
          '.news-summary', '.article-summary', '.story-summary', '.story-content',
          '.article-content', '.news-content', '.post-content'
        ];
        
        for (const descSel of descSelectors) {
          const descEl = $element.find(descSel).not(':has(h1, h2, h3, h4, h5, h6)').first();
          if (descEl.length) {
            const text = descEl.text().trim();
            if (text && text.length > 20 && text !== topic) {
              description = text;
              break;
            }
          }
        }

        // If no description, try extracting all text after title
        if (!description) {
          const allText = $element.text().trim();
          const parts = allText.split(topic);
          if (parts.length > 1) {
            const afterTitle = parts[1].trim();
            if (afterTitle.length > 20) {
              description = afterTitle.substring(0, 300);
            }
          }
        }

        // Clean up description
        if (description) {
          description = description
            .replace(/^COLOMBO\s*\([^)]+\)\s*[-–]\s*/i, '') // Remove bylines
            .replace(/^[^\w]*/, '')
            .replace(/\s+/g, ' ')
            .trim();
        }

        // Try to find image
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

        // Only add if we have a meaningful title
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

    // If still no items, try aggressive approach
    if (newsItems.length === 0) {
      console.log('No items found with standard selectors, trying aggressive approach...');
      
      $('a, h1, h2, h3, h4, h5, h6, .title, [class*="title"], [class*="headline"]').each((i, element) => {
        if (newsItems.length >= 10) return false;
        
        const $element = $(element);
        const text = $element.text().trim();
        
        if (text.length > 15 && text.length < 200) {
          const $parent = $element.closest('div, article, li, section');
          const description = $parent.find('p').first().text().trim();
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

    // Fetch full descriptions from article pages if requested or description is missing/short
    if (fetchDescriptions || uniqueItems.some(item => !item.description || item.description === 'No description available' || item.description.length < 50)) {
      console.log('Fetching full descriptions for articles...');
      
      const promises = uniqueItems.slice(0, 5).map(async (item) => {
        if (item.article_url && (!item.description || item.description === 'No description available' || item.description.length < 50)) {
          const fullDescription = await fetchArticleDescription(item.article_url);
          item.description = fullDescription.substring(0, 400);
        }
        return item;
      });
      
      const itemsWithDescriptions = await Promise.all(promises);
      const finalItems = [...itemsWithDescriptions, ...uniqueItems.slice(5)];
      
      console.log(`Fetched descriptions for ${itemsWithDescriptions.filter(item => item.description !== 'No description available').length} articles`);
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.status(200).json(finalItems);
      return;
    }

    console.log(`Final result: ${uniqueItems.length} unique news items`);

    // If still no items, log debugging info
    if (uniqueItems.length === 0) {
      console.log('No news items found. Debugging info:');
      console.log('Page title:', $('title').text());
      console.log('Number of links:', $('a').length);
      console.log('Number of images:', $('img').length);
      console.log('Sample HTML structure:', $('body').children().first().prop('tagName'));
      
      res.status(200).json({
        error: 'No news items found',
        debug: {
          pageTitle: $('title').text(),
          linksCount: $('a').length,
          imagesCount: $('img').length,
          bodyStructure: $('body').children().map((i, el) => $(el).prop('tagName')).get().slice(0, 10)
        }
      });
      return;
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.status(200).json(uniqueItems);

  } catch (error) {
    console.error('Scraping error:', error.message);
    res.status(500).json({ 
      error: 'Failed to scrape news', 
      details: error.message,
      url: req.query.type === 'local' ? 'https://sinhala.newsfirst.lk/local' : 'https://sinhala.newsfirst.lk/latest-news'
    });
  }
};
