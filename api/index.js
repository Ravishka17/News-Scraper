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
    const metaDescription = $('meta[name="description"]').attr('content');
    return metaDescription ? metaDescription.trim() : null;
  } catch (error) {
    console.log(`Failed to fetch description from ${articleUrl}: ${error.message}`);
    return null;
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

    // More comprehensive selectors for news items
    const selectors = [
      // Common news article selectors
      '.news-item',
      '.article-item',
      '.post-item',
      '.news-card',
      '.article-card',
      '.story-item',
      '.content-item',
      // Generic article and div selectors
      'article',
      '.article',
      '.post',
      '.story',
      '.content',
      // List item selectors
      'li[class*="news"]',
      'li[class*="article"]',
      'li[class*="post"]',
      // Div selectors with common patterns
      'div[class*="news"]',
      'div[class*="article"]',
      'div[class*="post"]',
      'div[class*="story"]',
      'div[class*="item"]'
    ];

    // Try each selector until we find news items
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
            if (topic && topic.length > 10) break; // Good title found
          }
        }

        // Try to find description - improved approach
        let description = '';
        let articleUrl = '';
        
        // Check if this element contains a link to a full article
        const articleLink = $element.find('a[href]').first();
        if (articleLink.length) {
          const href = articleLink.attr('href');
          // If it's a relative link, make it absolute
          articleUrl = href.startsWith('http') ? href : 
                     href.startsWith('/') ? `https://sinhala.newsfirst.lk${href}` :
                     `https://sinhala.newsfirst.lk/${href}`;
        }
        
        // Try to find description in current element first
        const descSelectors = [
          'p', '.summary', '.excerpt', '.description', '.content', '.text', '.lead',
          '.news-summary', '.article-summary', '.story-summary', '.story-content',
          '.article-content', '.news-content', '.post-content'
        ];
        
        for (const descSel of descSelectors) {
          const descEl = $element.find(descSel).first();
          if (descEl.length) {
            const text = descEl.text().trim();
            // Make sure it's not just the title repeated
            if (text && text.length > 20 && text !== topic) {
              description = text;
              break;
            }
          }
        }
        
        // If no description found, try to extract from all text in element
        if (!description) {
          const allText = $element.text().trim();
          // Split by the title and take what comes after
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
          // Remove common prefixes and clean up
          description = description
            .replace(/^COLOMBO\s*\([^)]+\)\s*[-–]\s*/i, '')
            .replace(/^[^\w]*/, '')
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
          const newsItem = {
            topic: topic.substring(0, 200), // Limit title length
            description: description || 'No description available',
            image_url: imageUrl || '',
            article_url: articleUrl || ''
          };
          
          newsItems.push(newsItem);
        }
      });

      // If we found items with this selector, break
      if (newsItems.length > 0) {
        console.log(`Found ${newsItems.length} items using selector: ${selector}`);
        break;
      }
    }

    // If still no items found, try a more aggressive approach
    if (newsItems.length === 0) {
      console.log('No items found with standard selectors, trying aggressive approach...');
      
      // Look for any elements with text that might be news titles
      $('a, h1, h2, h3, h4, h5, h6, .title, [class*="title"], [class*="headline"]').each((i, element) => {
        if (newsItems.length >= 10) return false;
        
        const $element = $(element);
        const text = $element.text().trim();
        
        // Check if this looks like a news title (has some length and common patterns)
        if (text.length > 15 && text.length < 200) {
          // Look for parent container for more info
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
          
          newsItems.push({
            topic: text,
            description: description || 'No description available',
            image_url: imageUrl || ''
          });
        }
      });
    }

    // Remove duplicates based on topic
    const uniqueItems = newsItems.filter((item, index, self) => 
      index === self.findIndex(i => i.topic === item.topic)
    );

    // If requested and we have article URLs, fetch full descriptions
    if (fetchDescriptions && uniqueItems.length > 0) {
      console.log('Fetching full descriptions for articles...');
      
      const promises = uniqueItems.slice(0, 5).map(async (item) => { // Limit to first 5 to avoid timeout
        if (item.article_url && item.description === 'No description available') {
          const fullDescription = await fetchArticleDescription(item.article_url);
          if (fullDescription) {
            item.description = fullDescription.substring(0, 400);
          }
        }
        return item;
      });
      
      const itemsWithDescriptions = await Promise.all(promises);
      // Add remaining items without fetching their descriptions
      const finalItems = [...itemsWithDescriptions, ...uniqueItems.slice(5)];
      
      console.log(`Fetched descriptions for ${itemsWithDescriptions.filter(item => item.description !== 'No description available').length} articles`);
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.status(200).json(finalItems);
      return;
    }

    console.log(`Final result: ${uniqueItems.length} unique news items`);

    // If still no items, log some debugging info
    if (uniqueItems.length === 0) {
      console.log('No news items found. Debugging info:');
      console.log('Page title:', $('title').text());
      console.log('Number of links:', $('a').length);
      console.log('Number of images:', $('img').length);
      console.log('Sample HTML structure:', $('body').children().first().prop('tagName'));
      
      // Return some basic page info for debugging
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
    res.setHeader('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
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
