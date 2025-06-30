const axios = require('axios');
const cheerio = require('cheerio');

// Helper function to fetch article description from individual page
const fetchArticleDescription = async (articleUrl) => {
  try {
    const { data } = await axios.get(articleUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 8000
    });
    
    const $ = cheerio.load(data);
    const metaDescription = $('meta[name="description"]').attr('content');
    
    if (metaDescription && metaDescription.trim().length > 20) {
      // Clean up the meta description
      let cleanDesc = metaDescription.trim()
        .replace(/^COLOMBO\s*\([^)]+\)\s*[-–]\s*/i, '')
        .replace(/\s*-\s*ශ්‍රී\s*ලංකා\s*ප්‍රවෘත්ති.*$/i, '')
        .trim();
      
      return cleanDesc;
    }
    
    return null;
  } catch (error) {
    console.log(`Failed to fetch description from ${articleUrl}: ${error.message}`);
    return null;
  }
};

module.exports = async (req, res) => {
  try {
    const type = req.query.type || 'latest';
    const fetchDescriptions = req.query.descriptions === 'true';
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
      timeout: 15000
    });

    const $ = cheerio.load(data);
    const newsItems = [];

    // First, try to find the main news container
    let foundItems = false;
    const containerSelectors = [
      '.news-list',
      '.article-list', 
      '.posts-list',
      '.content-list',
      '.main-content',
      '#main-content',
      '.container'
    ];

    for (const containerSel of containerSelectors) {
      const container = $(containerSel);
      if (container.length) {
        console.log(`Trying container: ${containerSel}`);
        
        // Look for individual news items within this container
        container.find('article, .article, .news-item, .post, div[class*="item"]').each((i, element) => {
          if (newsItems.length >= 15) return false;
          
          const $element = $(element);
          
          // Extract title - be more specific about what constitutes a good title
          let topic = '';
          const titleElements = $element.find('h1, h2, h3, h4, h5, a[title]');
          
          titleElements.each((j, titleEl) => {
            const $titleEl = $(titleEl);
            const titleText = $titleEl.attr('title') || $titleEl.text().trim();
            
            // Check if this looks like a proper news title
            if (titleText && 
                titleText.length > 10 && 
                titleText.length < 200 &&
                !titleText.match(/^\d{2}-\d{2}-\d{4}/) && // Not a date
                !titleText.includes('වැඩි විස්තර') && // Not "more details"
                !titleText.match(/^(AM|PM)$/)) { // Not time indicators
              
              topic = titleText;
              return false; // Break the loop
            }
          });
          
          if (!topic) return; // Skip if no good title found
          
          // Extract article URL
          let articleUrl = '';
          const linkEl = $element.find('a[href]').first();
          if (linkEl.length) {
            const href = linkEl.attr('href');
            if (href) {
              articleUrl = href.startsWith('http') ? href : 
                         href.startsWith('/') ? `https://sinhala.newsfirst.lk${href}` :
                         `https://sinhala.newsfirst.lk/${href}`;
            }
          }
          
          // Extract image
          let imageUrl = '';
          const imgEl = $element.find('img').first();
          if (imgEl.length) {
            imageUrl = imgEl.attr('src') || imgEl.attr('data-src') || imgEl.attr('data-lazy-src') || '';
            if (imageUrl && !imageUrl.startsWith('http') && !imageUrl.startsWith('data:')) {
              imageUrl = imageUrl.startsWith('/') 
                ? `https://sinhala.newsfirst.lk${imageUrl}`
                : `https://sinhala.newsfirst.lk/${imageUrl}`;
            }
          }
          
          // For now, don't try to extract description from listing page
          // as it's getting mixed up with other content
          
          newsItems.push({
            topic: topic.substring(0, 200),
            description: 'No description available',
            image_url: imageUrl || '',
            article_url: articleUrl || ''
          });
        });
        
        if (newsItems.length > 0) {
          foundItems = true;
          break;
        }
      }
    }

    // If no items found with container approach, try direct selection
    if (!foundItems) {
      console.log('No items found in containers, trying direct selection...');
      
      // Look for links that seem to point to news articles
      $('a[href*="/2025/"]').each((i, element) => {
        if (newsItems.length >= 15) return false;
        
        const $element = $(element);
        const href = $element.attr('href');
        const title = $element.attr('title') || $element.text().trim();
        
        // Check if this looks like a news article link
        if (title && 
            title.length > 15 && 
            title.length < 200 &&
            href && 
            href.includes('/2025/') &&
            !title.includes('වැඩි විස්තර')) {
          
          // Get the parent element to look for image
          const $parent = $element.closest('div, article, li');
          const imgEl = $parent.find('img').first();
          let imageUrl = '';
          
          if (imgEl.length) {
            imageUrl = imgEl.attr('src') || imgEl.attr('data-src') || '';
            if (imageUrl && !imageUrl.startsWith('http')) {
              imageUrl = imageUrl.startsWith('/') 
                ? `https://sinhala.newsfirst.lk${imageUrl}`
                : `https://sinhala.newsfirst.lk/${imageUrl}`;
            }
          }
          
          const articleUrl = href.startsWith('http') ? href : `https://sinhala.newsfirst.lk${href}`;
          
          newsItems.push({
            topic: title.substring(0, 200),
            description: 'No description available',
            image_url: imageUrl || '',
            article_url: articleUrl
          });
        }
      });
    }

    // Remove duplicates
    const uniqueItems = newsItems.filter((item, index, self) => 
      index === self.findIndex(i => i.topic === item.topic)
    );

    console.log(`Found ${uniqueItems.length} unique news items`);

    // If requested, fetch full descriptions from individual pages
    if (fetchDescriptions && uniqueItems.length > 0) {
      console.log('Fetching full descriptions...');
      
      // Fetch descriptions for all items, but limit concurrent requests
      const batchSize = 3;
      const results = [];
      
      for (let i = 0; i < uniqueItems.length; i += batchSize) {
        const batch = uniqueItems.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (item) => {
          if (item.article_url) {
            const description = await fetchArticleDescription(item.article_url);
            return {
              ...item,
              description: description || 'No description available'
            };
          }
          return item;
        });
        
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        
        // Small delay between batches to be respectful
        if (i + batchSize < uniqueItems.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      const itemsWithDescriptions = results.filter(item => item.description !== 'No description available');
      console.log(`Successfully fetched descriptions for ${itemsWithDescriptions.length} out of ${uniqueItems.length} articles`);
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'public, max-age=600'); // Cache for 10 minutes
      res.status(200).json(results);
      return;
    }

    // Return items without descriptions if not requested
    if (uniqueItems.length === 0) {
      console.log('No news items found. Debugging info:');
      console.log('Page title:', $('title').text());
      console.log('Number of links:', $('a').length);
      console.log('Number of 2025 links:', $('a[href*="/2025/"]').length);
      
      res.status(200).json({
        error: 'No news items found',
        debug: {
          pageTitle: $('title').text(),
          linksCount: $('a').length,
          links2025Count: $('a[href*="/2025/"]').length,
          sampleLinks: $('a[href*="/2025/"]').slice(0, 5).map((i, el) => ({
            href: $(el).attr('href'),
            text: $(el).text().trim().substring(0, 50)
          })).get()
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
