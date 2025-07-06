const axios = require('axios');
const cheerio = require('cheerio');

const API_URLS = {
  latest: 'https://apisinhala.newsfirst.lk/post/PostPagination/0/5',
  local: 'https://apisinhala.newsfirst.lk/post/categoryPostPagination/81/0/5',
  sports: 'https://apisinhala.newsfirst.lk/post/categoryPostPagination/283/0/3',
  featured: 'https://apisinhala.newsfirst.lk/post/categoryPostPagination/36569/0/5'
};

// Helper function to decode Unicode escapes
const decodeUnicode = (str) => {
  return str.replace(/\\u[\dA-F]{4}/gi, (match) => {
    return String.fromCharCode(parseInt(match.replace('\\u', ''), 16));
  });
};

// Helper function to extract description and additional images from content.rendered
const extractContentData = (contentRendered, imageUrls = {}) => {
  try {
    // Normalize content: decode Unicode escapes and remove extra newlines/whitespace
    const normalizedContent = decodeUnicode(contentRendered)
      .replace(/\r\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Log raw and normalized content for debugging
    console.log('Raw content.rendered:', contentRendered.substring(0, 200));
    console.log('Normalized content.rendered:', normalizedContent.substring(0, 200));
    
    const $ = cheerio.load(normalizedContent, { decodeEntities: false });
    
    // Extract ALL text content, not just from specific tags
    // First, try to get structured content from h3 and p tags
    const structuredElements = $('h3, p').map((i, el) => {
      const text = $(el).text().trim();
      return text;
    }).get();
    
    // If no structured elements found, get all text content
    let allTextContent = '';
    if (structuredElements.length === 0 || structuredElements.join('').length < 50) {
      // Remove script and style tags first
      $('script, style').remove();
      allTextContent = $('body').length > 0 ? $('body').text() : $.text();
    }
    
    // Combine structured and unstructured content
    const textSources = structuredElements.length > 0 ? structuredElements : [allTextContent];
    
    console.log('Text sources:', textSources);

    // Process and clean all text content
    const cleanedParagraphs = textSources
      .map(text => {
        if (!text || typeof text !== 'string') return '';
        
        // Remove "COLOMBO (News 1st)" or similar prefixes
        let cleanedText = text.replace(/^(COLOMBO\s*\(News\s*1st\)\s*[-–]?\s*)/i, '').trim();
        
        // Remove "වැඩි විස්තර කියවන්න" (Read more details)
        cleanedText = cleanedText.replace(/වැඩි\s*විස්තර\s*කියවන්න/g, '').trim();
        
        // Remove date patterns
        cleanedText = cleanedText.replace(/^\d{1,2}-\d{1,2}-\d{4}/g, '').trim();
        
        // Remove extra whitespace
        cleanedText = cleanedText.replace(/\s+/g, ' ').trim();
        
        return cleanedText;
      })
      .filter(text => text && text.length > 0);

    console.log('Cleaned paragraphs:', cleanedParagraphs);

    // Join all paragraphs to form the complete description
    let description = cleanedParagraphs.join(' ').trim();
    
    // If still no good description, try extracting from raw HTML
    if (!description || description.length < 20) {
      // Try to extract text from the raw HTML without cheerio parsing
      const rawText = normalizedContent
        .replace(/<[^>]*>/g, ' ') // Remove HTML tags
        .replace(/\s+/g, ' ') // Normalize whitespace
        .replace(/^(COLOMBO\s*\(News\s*1st\)\s*[-–]?\s*)/i, '') // Remove prefix
        .replace(/වැඩි\s*විස්තර\s*කියවන්න/g, '') // Remove "Read more"
        .trim();
      
      if (rawText.length > description.length) {
        description = rawText;
      }
    }
    
    // Log final description
    console.log('Final description:', description);
    console.log('Description length:', description.length);

    // Extract images with src attribute only
    const allImages = $('img[src]')
      .map((i, el) => {
        let src = $(el).attr('src');
        if (!src) return null;
        // Ensure the URL is absolute
        if (!src.startsWith('http') && !src.startsWith('data:')) {
          src = src.startsWith('/') ? `https://sinhala.newsfirst.lk${src}` : `https://sinhala.newsfirst.lk/${src}`;
        }
        // Only include valid image URLs
        if (!src.match(/\.(jpg|jpeg|png|gif)$/i)) return null;
        return src;
      })
      .get()
      .filter(src => src && src.includes('sinhala-uploads/'));

    // Get all provided image URLs for exclusion
    const providedImageUrls = Object.values(imageUrls).filter(url => url && url.match(/\.(jpg|jpeg|png|gif)$/i));

    // Filter images to include only content-related ones
    const additionalImages = allImages.filter(src => {
      if (!src) return false;
      if (providedImageUrls.includes(src)) return false;
      const filename = src.split('/').pop();
      const srcBase = filename.split('.')[0].split('-').slice(0, -1).join('-');
      const imageUrlBase = imageUrls.news_detail_image 
        ? imageUrls.news_detail_image.split('/').pop().split('.')[0].split('-').slice(0, -1).join('-')
        : '';
      return srcBase !== imageUrlBase && 
             !src.includes('_200x120') && 
             !src.includes('_550x300') && 
             !src.includes('_650x250') && 
             !src.includes('_850x460') && 
             !src.includes('assets/') && 
             !src.includes('advertisements/') && 
             !src.includes('statics/');
    });

    // Remove duplicates
    const uniqueAdditionalImages = [...new Set(additionalImages)];

    // Handle description fallback
    if (!description || description.length < 10) {
      description = 'No detailed description available.';
      if (uniqueAdditionalImages.length > 0) {
        description += ' See additional images for more details.';
      }
    }

    return {
      description,
      additional_images: uniqueAdditionalImages.length > 0 ? uniqueAdditionalImages : ['No additional images']
    };
  } catch (error) {
    console.log(`Failed to parse content: ${error.message}`);
    return { 
      description: 'No detailed description available.', 
      additional_images: ['No additional images'] 
    };
  }
};

module.exports = async (req, res) => {
  try {
    const type = req.query.type || 'latest';
    const apiUrl = API_URLS[type] || API_URLS.latest;

    console.log(`Scraping URL: ${apiUrl}`);

    const { data } = await axios.get(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive'
      },
      timeout: 10000
    });

    const newsItems = [];

    if (data.postResponseDto && Array.isArray(data.postResponseDto)) {
      for (const item of data.postResponseDto.slice(0, 20)) {
        const topic = item.short_title || item.title?.rendered || '';
        const articleUrl = item.post_url ? 
          (item.post_url.startsWith('http') ? item.post_url : `https://sinhala.newsfirst.lk/${item.post_url}`) : '';
        const imageUrls = item.images || {};
        
        const { description, additional_images } = extractContentData(item.content?.rendered || '', {
          news_detail_image: imageUrls.news_detail_image,
          post_thumb: imageUrls.post_thumb,
          mobile_banner: imageUrls.mobile_banner,
          mini_tile_image: imageUrls.mini_tile_image,
          large_tile_image: imageUrls.large_tile_image
        });

        if (topic && topic.length > 5) {
          newsItems.push({
            topic: topic.substring(0, 200),
            description,
            news_detail_image: imageUrls.news_detail_image || '',
            post_thumb: imageUrls.post_thumb || '',
            mobile_banner: imageUrls.mobile_banner || '',
            mini_tile_image: imageUrls.mini_tile_image || '',
            large_tile_image: imageUrls.large_tile_image || '',
            article_url: articleUrl || '',
            additional_images
          });
        }
      }
    }

    const uniqueItems = newsItems.filter((item, index, self) => 
      index === self.findIndex(i => i.topic === item.topic)
    );

    console.log(`Fetched ${uniqueItems.length} unique news items`);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.status(200).json(uniqueItems);

  } catch (error) {
    console.error('Scraping error:', error.message);
    res.status(500).json({ 
      error: 'Failed to scrape news', 
      details: error.message,
      url: API_URLS[req.query.type] || API_URLS.latest
    });
  }
};
