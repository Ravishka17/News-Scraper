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
    if (!contentRendered || typeof contentRendered !== 'string') {
      console.log('No content.rendered found or invalid type');
      return { 
        description: 'No detailed description available.', 
        additional_images: ['No additional images'] 
      };
    }

    // Log raw content for debugging
    console.log('Raw content.rendered:', contentRendered);
    
    // Decode Unicode escapes first
    const decodedContent = decodeUnicode(contentRendered);
    console.log('Decoded content:', decodedContent);
    
    // Extract text by removing HTML tags but preserve content structure
    let description = decodedContent
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove script tags
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove style tags
      .replace(/<[^>]*>/g, ' ') // Remove all other HTML tags
      .replace(/\r\n/g, ' ') // Replace line breaks with spaces
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    console.log('After HTML removal:', description);
    console.log('Length after HTML removal:', description.length);
    
    // Only remove prefixes if description is long enough
    if (description.length > 10) {
      // Remove "COLOMBO (News 1st)" prefix only if it exists
      const originalLength = description.length;
      description = description.replace(/^(COLOMBO\s*\(News\s*1st\)\s*[-–]?\s*)/i, '').trim();
      console.log('After prefix removal:', description);
      console.log('Length changed from', originalLength, 'to', description.length);
      
      // Remove "වැඩි විස්තර කියවන්න" (Read more details)
      description = description.replace(/වැඩි\s*විස්තර\s*කියවන්න/g, '').trim();
      
      // Remove date patterns at the beginning
      description = description.replace(/^\d{1,2}-\d{1,2}-\d{4}/g, '').trim();
      
      // Final cleanup
      description = description.replace(/\s+/g, ' ').trim();
    }
    
    console.log('Final processed description:', description);
    console.log('Final description length:', description.length);
    
    // If description is empty or too short, try alternative methods
    if (!description || description.length < 5) {
      console.log('Description too short, trying alternative extraction...');
      
      // Try using cheerio to parse the content
      const $ = cheerio.load(decodedContent, { decodeEntities: false });
      
      // Try different selectors
      const alternatives = [
        $('h3').text() + ' ' + $('p').text(),
        $.text(),
        decodedContent.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      ];
      
      for (const alt of alternatives) {
        const cleaned = alt.replace(/\s+/g, ' ').trim();
        console.log('Alternative attempt:', cleaned.substring(0, 100) + '...');
        if (cleaned.length > description.length) {
          description = cleaned;
          break;
        }
      }
    }

        
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
