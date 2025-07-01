const axios = require('axios');
const cheerio = require('cheerio');

// Helper function to fetch full article description and additional images
const fetchArticleDescription = async (articleUrl) => {
  try {
    const { data } = await axios.get(articleUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });
    
    const $ = cheerio.load(data);
    // Extract description from article body paragraphs
    const paragraphs = $('div[class*="content"], div[class*="article"], div[class*="post"], div[class*="story"], article, section, p')
      .not('.read-more, a, button, .button, [class*="more"], [class*="button"], [class*="advert"], [class*="footer"], [class*="meta"]')
      .map((i, el) => $(el).text().trim())
      .get()
      .filter(text => text && 
        text.length > 10 && 
        !text.includes('COLOMBO (News1st)') && 
        !text.includes('ශ්‍රී ලංකා ප්‍රවෘත්ති') && 
        !text.includes('වැඩි විස්තර කියවන්න') && 
        !text.match(/^\d{1,2}-\d{1,2}-\d{4}/));
    
    let description = paragraphs.join(' ').trim();
    
    // Extract all images from the body to ensure we don't miss any
    const allImages = $('body').find('img')
      .map((i, el) => {
        let src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src') || $(el).attr('data-original') || '';
        if (src && !src.startsWith('http') && !src.startsWith('data:')) {
          src = src.startsWith('/') ? `https://sinhala.newsfirst.lk${src}` : `https://sinhala.newsfirst.lk/${src}`;
        }
        // Log parent element for debugging
        return { src, parent: `${$(el).parent().prop('tagName')}.${$(el).parent().attr('class') || ''}` };
      })
      .get();
    
    // Log all images before filtering
    console.log(`All images found:`, allImages);
    
    // Filter images to include only content-related ones
    const additionalImages = allImages
      .map(item => item.src)
      .filter(src => src && 
        src !== '' && 
        !src.includes('_200x120') && 
        !src.includes('_550x300') && 
        !src.includes('_650x250') && 
        !src.includes('_850x460') && // Exclude thumbnails
        !src.includes('assets/') && // Exclude assets folder (logos, icons)
        !src.includes('advertisements/') && // Exclude ads
        !src.includes('statics/') && // Exclude static images
        !src.match(/icons8.*\.(png|jpg|jpeg)/) && // Exclude social media icons
        !src.includes('logo') && // Exclude logos
        !src.includes('facebook') && 
        !src.includes('twitter') && 
        !src.includes('instagram') && 
        !src.includes('youtube') && 
        !src.includes('viber') && 
        !src.includes('whatsapp') && 
        !src.includes('sirasa') && 
        !src.includes('shakthi') && 
        !src.includes('yes_fm') && 
        !src.includes('legends') && 
        !src.includes('TV1') && 
        !src.includes('CMG') && 
        src.includes('sinhala-uploads/')); // Only include images from sinhala-uploads
    
    // Log for debugging
    console.log(`Article URL: ${articleUrl}`);
    console.log(`Found paragraphs: ${paragraphs.length}`);
    console.log(`Filtered images: ${additionalImages.length}`, additionalImages);
    
    // If description is short or contains placeholder text, use a cleaner fallback
    if (!description || description.length < 50 || description.includes('අදාල නිවේදනය පහතින් දැක්වේ')) {
      description = paragraphs.length > 0 
        ? paragraphs.join(' ').trim()
        : 'No detailed description available.';
      // Only append image reference if images exist
      if (additionalImages.length > 0) {
        description += ' See additional images for more details.';
      }
    }
    
    return {
      description: description,
      additional_images: additionalImages
    };
  } catch (error) {
    console.log(`Failed to fetch description from ${articleUrl}: ${error.message}`);
    return { description: 'No description available', additional_images: [] };
  }
};

module.exports = async (req, res) => {
  try {
    const type = req.query.type || 'latest';
    const url = type === 'local' 
      ? 'https://sinhala.newsfirst.lk/local' 
      : 'https://sinhala.newsfirst.lk/latest-news';

    console.log(`Scraping URL: ${url}`);

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
      'div[class*="news"]', 'div[class*="article"], 'div[class*="post"]',
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
          const descEl = $element.find(descSel)
            .not('h1, h2, аппарат h3, h4, h5, h6, a.read-more, button, .button, [class*="more"], [class*="advert"]')
            .first();
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

        // Fallback: Extract text after title
        if (!description) {
          const allText = $element.text().trim();
          const parts = allText.split(topic);
          if (parts.length > 1) {
            let afterTitle = parts[1].trim();
            if (afterTitle && afterTitle.length > 20) {
              afterTitle = afterTitle.replace(/COLOMBO\s*\([^)]+\)\s*[-–]\s*/i, '')
                                    .replace(/ශ්‍රී ලංකා ප්‍රවෘත්ති.*$/, '')
                                    .replace(/වැඩි විස්තර කියවන්e.*$/, '')
                                    .replace(/අදාල නිවේදනය පහතින් දැක්වේ.*$/, '')
                                    .replace(/^\d{1,2}-\d{1,2}-\d{4}.*$/, '');
              if (afterTitle.length > 20) {
                description = afterTitle;
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
            .replace(/අදාල නිවේදනය පහතින් දැක්වේ.*$/, '')
            .replace(/^\d{1,2}-\d{1,2}-\d{4}.*$/, '')
            .replace(/\s+/g, ' ')
            .trim();
        }

        // Extract primary image
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
            article_url: articleUrl || '',
            additional_images: []
          });
        }
      });

      if (newsItems.length > 0) {
        console.log(`Found ${newsItems.length} items using selector: ${selector}`);
        break;
      }
    }

    // Aggressive approach if no iems found
    if (newsItems.length === 0) {
      console.log('No items found with standard selectors, trying aggressive approach...');
      
      $('a, h1, h2, h3, h4, h5, h6, .title, [class*="title"], [class*="headline"]').each((i, element) => {
        if (newsItems.length >= 10) return false;
        
        const $element = $(element);
        const text = $element.text().trim();
        
        if (text.length > 15 && text.length < 200) {
          const $parent = $element.closest('div, article, li, section');
          let description = $parent.find('p')
            .not('h1, h2, h3, h4, h5, h6, a.read-more, button, .button, [class*="more"], [class*="advert"]')
            .first()
            .text()
            .trim();
          
          if (description) {
            description = description
              .replace(/COLOMBO\s*\([^)]+\)\s*[-–]\s*/i, '')
              .replace(/ශ්‍රී ලංකා ප්‍රවෘත්ති.*$/, '')
              .replace(/වැඩි විස්තර කියවන්න.*$/, '')
              .replace(/අදාල නිවේදනය පහතින් දැක්වේ.*$/, '')
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
            article_url: articleUrl || '',
            additional_images: []
          });
        }
      });
    }

    // Remove duplicates based on topic
    const uniqueItems = newsItems.filter((item, index, self) => 
      index === self.findIndex(i => i.topic === item.topic)
    );

    // Fetch full descriptions and additional images from article pages
    console.log('Fetching full descriptions and images for articles...');
    
    const promises = uniqueItems.map(async (item, index) => {
      if (item.article_url) {
        await new Promise(resolve => setTimeout(resolve, index * 1500)); // Delay to avoid rate-limiting
        const { description, additional_images } = await fetchArticleDescription(item.article_url);
        item.description = description;
        item.additional_images = additional_images;
      }
      return item;
    });
    
    const itemsWithDescriptions = await Promise.all(promises);
    
    console.log(`Fetched descriptions for ${itemsWithDescriptions.filter(item => item.description !== 'No description available').length} articles`);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.status(200).json(itemsWithDescriptions);

  } catch (error) {
    console.error('Scraping error:', error.message);
    res.status(500).json({ 
      error: 'Failed to scrape news', 
      details: error.message,
      url: req.query.type === 'local' ? 'https://sinhala.newsfirst.lk/local' : 'https://sinhala.newsfirst.lk/latest-news'
    });
  }
};
