const axios = require('axios');
const cheerio = require('cheerio');

const API_URLS = {
  latest: 'https://apisinhala.newsfirst.lk/post/PostPagination/0/5',
  local: 'https://apisinhala.newsfirst.lk/post/categoryPostPagination/81/0/5',
  sports: 'https://apisinhala.newsfirst.lk/post/categoryPostPagination/283/0/3',
  featured: 'https://apisinhala.newsfirst.lk/post/categoryPostPagination/36569/0/5'
};

// Helper function to extract description and additional images from content.rendered
const extractContentData = (contentRendered, imageUrls = {}) => {
  try {
    // Normalize content by removing extra newlines and whitespace
    const normalizedContent = contentRendered.replace(/\r\n/g, '').trim();
    
    // Log the raw and normalized content.rendered for debugging
    console.log('Raw content.rendered:', contentRendered.substring(0, 200));
    console.log('Normalized content.rendered:', normalizedContent.substring(0, 200));
    
    const $ = cheerio.load(normalizedContent);
    
    // Extract text from <h3> and <p> tags
    const elements = $('h3, p').map((i, el) => $(el).text().trim()).get();
    
    // Log all extracted elements for debugging
    console.log('Extracted elements:', elements);

    // Filter and clean paragraphs
    const paragraphs = elements
      .filter(text => 
        text && // Ensure text is not empty
        text.length > 0 && // Ensure non-zero length
        !text.includes('වැඩි විස්තර කියවන්න') && // Exclude "Read more details"
        !text.match(/^\d{1,2}-\d{1,2}-\d{4}/) && // Exclude date-like patterns
        !text.match(/^\s*$/) // Exclude empty or whitespace-only strings
      )
      .map(text => {
        // Remove "COLOMBO (News 1st)" or "COLOMBO (News1st)" prefix if present
        return text.replace(/^(COLOMBO\s*\(News\s*1st\)\s*[-–]?\s*)/i, '').trim();
      })
      .filter(text => text.length > 0); // Ensure non-empty after cleaning

    // Log filtered paragraphs for debugging
    console.log('Filtered paragraphs:', paragraphs);

    // Join paragraphs to form description
    let description = paragraphs.join(' ').trim();
    
    // Log final description
    console.log('Final description:', description);

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

    // Filter images to include only content-related ones, excluding all provided image URLs
    const additionalImages = allImages.filter(src => {
      if (!src) return false;
      
      // Exclude all provided image URLs
      if (providedImageUrls.includes(src)) return false;
      
      // Extract base filename for comparison
      const filename = src.split('/').pop();
      const srcBase = filename.split('.')[0].split('-').slice(0, -1).join('-');
      
      // Extract base from primary image for exclusion
      const imageUrlBase = imageUrls.news_detail_image 
        ? imageUrls.news_detail_image.split('/').pop().split('.')[0].split('-').slice(0, -1).join('-')
        : '';
      
      return srcBase !== imageUrlBase && // Exclude images matching primary image base
             !src.includes('_200x120') && 
             !src.includes('_550x300') && 
             !src.includes('_650x250') && 
             !src.includes('_850x460') && // Exclude thumbnails
             !src.includes('assets/') && // Exclude assets folder (logos, icons)
             !src.includes('advertisements/') && // Exclude ads
             !src.includes('statics/'); // Exclude static images
    });

    // Remove duplicates
    const uniqueAdditionalImages = [...new Set(additionalImages)];

    // Handle description fallback
    if (!description || description.length < 10) {
      description = paragraphs.length > 0 
        ? paragraphs.join(' ').trim()
        : 'No detailed description available.';
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
    const apiUrl = API_URLS[type] || API_URLS.latest; // Default to latest if type is invalid

    console.log(`Scraping URL: ${apiUrl}`);

    // Fetch data from the API
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

    // Process JSON data from API
    if (data.postResponseDto && Array.isArray(data.postResponseDto)) {
      for (const item of data.postResponseDto.slice(0, 20)) { // Limit to 20 items
        const topic = item.short_title || item.title?.rendered || '';
        
        // Properly construct article URL
        const articleUrl = item.post_url ? 
          (item.post_url.startsWith('http') ? item.post_url : `https://sinhala.newsfirst.lk/${item.post_url}`) : '';
        
        // Use correct image URLs from JSON data
        const imageUrls = item.images || {};
        
        // Extract description and additional images from content.rendered
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

    // Remove duplicates based on topic
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
