const axios = require('axios');
const cheerio = require('cheerio');

// Helper function to fetch full article description and additional images
const fetchArticleDescription = async (articleUrl, imageUrls = {}) => {
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
        text.length > 20 && 
        !text.includes('COLOMBO (News1st)') && 
        !text.includes('ශ්‍රී ලංකා ප්‍රවූත්ති') && 
        !text.includes('වැඩි විස්තර කියවන්න') && 
        !text.match(/^\d{1,2}-\d{1,2}-\d{4}/));

    let description = paragraphs.join(' ').trim();
    
    // Extract images with src attribute only
    const allImages = $('body').find('img[src]')
      .map((i, el) => {
        let src = $(el).attr('src');
        if (src && !src.startsWith('http') && !src.startsWith('data:')) {
          src = src.startsWith('/') ? `https://sinhala.newsfirst.lk${src}` : `https://sinhala.newsfirst.lk/${src}`;
        }
        return src;
      })
      .get()
      .filter(src => src && src.includes('sinhala-uploads/'));

    // Extract base filename from primary image_url for exclusion
    const imageUrlBase = imageUrls.news_detail_image 
      ? imageUrls.news_detail_image.split('/').pop().split('.')[0].split('_')[0]
      : '';

    // Filter images to include only content-related ones, excluding all provided image URLs
    const additionalImages = allImages.filter(src => {
      if (!src) return false;
      const filename = src.split('/').pop();
      const srcBase = filename.split('.')[0].split('_')[0];
      return srcBase !== imageUrlBase && // Exclude images matching primary image base
             !Object.values(imageUrls).includes(src) && // Exclude all provided image URLs
             !src.includes('_200x120') && 
             !src.includes('_550x300') && 
             !src.includes('_650x250') && 
             !src.includes('_850x460') && // Exclude thumbnails
             !src.includes('assets/') && // Exclude assets folder (logos, icons)
             !src.includes('advertisements/') && // Exclude ads
             !src.includes('statics/'); // Exclude static images
    });

    // Handle description
    if (!description || description.length < 50 || description.includes('අදාල නිවේදනය පහතින් දැක්වේ')) {
      description = paragraphs.length > 0 
        ? paragraphs.join(' ').trim()
        : 'No detailed description available.';
      if (additionalImages.length > 0) {
        description += ' See additional images for more details.';
      }
    }

    return {
      description,
      additional_images: additionalImages.length > 0 ? additionalImages : ['No additional images']
    };
  } catch (error) {
    console.log(`Failed to fetch description from ${articleUrl}: ${error.message}`);
    return { 
      description: 'No detailed description available.', 
      additional_images: ['No additional images'] 
    };
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
          const descEl = $element.find(descSel)
            .not('h1, h2, h3, h4, h5, h6, a.read-more, button, .button, [class*="more"], [class*="advert"]')
            .first();
          if (descEl.length) {
            const text = descEl.text().trim();
            if (text && text.length > 20 && text !== topic && 
                !text.includes('COLOMBO (News1st)') && 
                !text.includes('ශ්‍රී ලංකා ප්‍රවූත්ති') && 
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
              afterTitle = afterTitle
                .replace(/COLOMBO\s*\([^)]+\)\s*[-–]\s*/i, '')
                .replace(/ශ්‍රී ලංකා ප්‍රවූත්ති.*$/, '')
                .replace(/වැඩි විස්තර කියවන්න.*$/, '')
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
            .replace(/ශ්‍රී ලංකා ප්‍රවූත්ති.*$/, '')
            .replace(/වැඩි විස්තර කියවන්න.*$/, '')
            .replace(/අදාල නිවේදනය පහතින් දැක්වේ.*$/, '')
            .replace(/^\d{1,2}-\d{1,2}-\d{4}.*$/, '')
            .replace(/\s+/g, ' ')
            .trim();
        }

        // Extract primary image and variants
        const img = $element.find('img').first();
        let imageUrls = {
          news_detail_image: '',
          post_thumb: '',
          mobile_banner: '',
          mini_tile_image: '',
          large_tile_image: ''
        };

        if (img.length) {
          const baseSrc = img.attr('src') || img.attr('data-src') || img.attr('data-lazy-src') || '';
          if (baseSrc) {
            const normalizedSrc = baseSrc.startsWith('http') || baseSrc.startsWith('data:') 
              ? baseSrc 
              : baseSrc.startsWith('/') 
                ? `https://sinhala.newsfirst.lk${baseSrc}`
                : `https://sinhala.newsfirst.lk/${baseSrc}`;
            
            // Derive base filename without suffix
            const filename = normalizedSrc.split('/').pop().split('.')[0].split('_')[0];
            const basePath = normalizedSrc.split('/').slice(0, -1).join('/');

            // Assign image URLs based on common thumbnail patterns
            imageUrls.news_detail_image = normalizedSrc;
            imageUrls.post_thumb = `${basePath}/${filename}_200x120.jpg`;
            imageUrls.mobile_banner = `${basePath}/${filename}_550x300.jpg`;
            imageUrls.mini_tile_image = `${basePath}/${filename}_650x250.jpg`;
            imageUrls.large_tile_image = `${basePath}/${filename}_850x460.jpg`;
          }
        }

        // Add item if title is valid
        if (topic && topic.length > 5) {
          newsItems.push({
            topic: topic.substring(0, 200),
            description: description || 'No description available',
            ...imageUrls, // Spread image URLs directly into the item
            article_url: articleUrl || '',
            additional_images: ['No additional images']
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
          let description = $parent.find('p')
            .not('h1, h2, h3, h4, h5, h6, a.read-more, button, .button, [class*="more"], [class*="advert"]')
            .first()
            .text()
            .trim();
          
          if (description) {
            description = description
              .replace(/COLOMBO\s*\([^)]+\)\s*[-–]\s*/i, '')
              .replace(/ශ්‍රී ලංකා ප්‍රවූත්ති.*$/, '')
              .replace(/වැඩි විස්තර කියවන්න.*$/, '')
              .replace(/අදාල නිවේදනය පහතින් දැක්වේ.*$/, '')
              .replace(/^\d{1,2}-\d{1,2}-\d{4}.*$/, '')
              .replace(/\s+/g, ' ')
              .trim();
          }
          
          const img = $parent.find('img').first();
          let imageUrls = {
            news_detail_image: '',
            post_thumb: '',
            mobile_banner: '',
            mini_tile_image: '',
            large_tile_image: ''
          };

          if (img.length) {
            const baseSrc = img.attr('src') || img.attr('data-src') || '';
            if (baseSrc) {
              const normalizedSrc = baseSrc.startsWith('http') 
                ? baseSrc 
                : baseSrc.startsWith('/') 
                  ? `https://sinhala.newsfirst.lk${baseSrc}`
                  : `https://sinhala.newsfirst.lk/${baseSrc}`;
              
              const filename = normalizedSrc.split('/').pop().split('.')[0].split('_')[0];
              const basePath = normalizedSrc.split('/').slice(0, -1).join('/');

              imageUrls.news_detail_image = normalizedSrc;
              imageUrls.post_thumb = `${basePath}/${filename}_200x120.jpg`;
              imageUrls.mobile_banner = `${basePath}/${filename}_550x300.jpg`;
              imageUrls.mini_tile_image = `${basePath}/${filename}_650x250.jpg`;
              imageUrls.large_tile_image = `${basePath}/${filename}_850x460.jpg`;
            }
          }
          
          const articleLink = $element.is('a') ? $element : $parent.find('a[href]').first();
          const articleUrl = articleLink.length ? (articleLink.attr('href').startsWith('http') ? 
            articleLink.attr('href') : `https://sinhala.newsfirst.lk${articleLink.attr('href')}`) : '';
          
          newsItems.push({
            topic: text,
            description: description || 'No description available',
            ...imageUrls,
            article_url: articleUrl || '',
            additional_images: ['No additional images']
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
        const { description, additional_images } = await fetchArticleDescription(item.article_url, {
          news_detail_image: item.news_detail_image,
          post_thumb: item.post_thumb,
          mobile_banner: item.mobile_banner,
          mini_tile_image: item.mini_tile_image,
          large_tile_image: item.large_tile_image
        });
        item.description = description;
        item.additional_images = additional_images;
      }
      return item;
    });
    
    const itemsWithDescriptions = await Promise.all(promises);
    
    console.log(`Fetched descriptions for ${itemsWithDescriptions.filter(item => item.description !== 'No detailed description available.').length} articles`);
    
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
