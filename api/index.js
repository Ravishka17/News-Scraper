const axios = require('axios');
const cheerio = require('cheerio');

// Helper function to fetch full article description and additional images
const fetchArticleDescription = async (articleUrl, imageUrls) => {
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
    
    // Extract images with src attribute only
    const allImages = $('body').find('img[src]')
      .map((i, el) => {
        let src = $(el).attr('src');
        if (src && !src.startsWith('http') && !src.startsWith('data:')) {
          src = src.startsWith('/') ? `https://sinhala.newsfirst.lk${src}` : `https://sinhala.newsfirst.lk/${src}`;
        }
        return src;
      })
      .get();
    
    // Extract base filenames from imageUrls for exclusion
    const imageUrlBases = Object.values(imageUrls || {}).map(imageUrl => {
      if (imageUrl) {
        const filename = imageUrl.split('/').pop();
        const baseParts = filename.split('_')[0].split('-');
        return baseParts.length > 1 ? baseParts.slice(0, -1).join('-') : filename.split('.')[0];
      }
      return '';
    }).filter(base => base);
    
    // Filter images to include only content-related ones, excluding provided image_urls
    const additionalImages = allImages
      .filter(src => {
        if (!src || src === '' || !src.includes('sinhala-uploads/')) return false;
        const filename = src.split('/').pop();
        const srcBase = filename.split('.')[0].split('_')[0];
        return !imageUrlBases.includes(srcBase) && // Exclude images matching any image_url base
               !Object.values(imageUrls || {}).includes(src) && // Exclude exact matches
               !src.includes('assets/') && // Exclude assets folder
               !src.includes('advertisements/') && // Exclude ads
               !src.includes('statics/'); // Exclude static images
      });
    
    // If description is short or contains placeholder text, use a cleaner fallback
    if (!description || description.length < 50 || description.includes('අදාල නිවේදනය පහතින් දැක්වේ')) {
      description = paragraphs.length > 0 
        ? paragraphs.join(' ').trim()
        : 'No detailed description available.';
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
    const apiUrl = 'https://apisinhala.newsfirst.lk/post/PostPagination/0/5';

    console.log(`Fetching data from API: ${apiUrl}`);

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

    // Process API response
    if (data?.body?.postResponseDto) {
      for (const item of data.body.postResponseDto) {
        const topic = item.title?.rendered || '';
        const articleUrl = `https://sinhala.newsfirst.lk/${item.post_url || ''}`;
        const description = item.excerpt?.rendered
          .replace(/<[^>]+>/g, '') // Remove HTML tags
          .replace(/COLOMBO\s*\([^)]+\)\s*[-–]\s*/i, '')
          .replace(/ශ්‍රී ලංකා ප්‍රවෘත්ති.*$/, '')
          .replace(/වැඩි විස්තර කියවන්න.*$/, '')
          .replace(/අදාල නිවේදනය පහතින් දැක්වේ.*$/, '')
          .replace(/^\d{1,2}-\d{1,2}-\d{4}.*$/, '')
          .replace(/\s+/g, ' ')
          .trim() || 'No description available';

        // Extract all image URLs
        const images = {
          news_detail_image: item.images?.news_detail_image || '',
          post_thumb: item.images?.post_thumb || '',
          mobile_banner: item.images?.mobile_banner || '',
          mini_tile_image: item.images?.mini_tile_image || '',
          large_tile_image: item.images?.large_tile_image || ''
        };

        // Use large_tile_image as primary image_url if available
        const imageUrl = images.large_tile_image || '';

        if (topic && topic.length > 5) {
          newsItems.push({
            topic: topic.substring(0, 200),
            description,
            image_url: imageUrl,
            article_url: articleUrl,
            news_detail_image: images.news_detail_image,
            post_thumb: images.post_thumb,
            mobile_banner: images.mobile_banner,
            mini_tile_image: images.mini_tile_image,
            large_tile_image: images.large_tile_image,
            additional_images: []
          });
        }
      }
    }

    // Fetch full descriptions and additional images from article pages
    console.log('Fetching full descriptions and images for articles...');
    
    const promises = newsItems.map(async (item, index) => {
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
    
    console.log(`Fetched descriptions for ${itemsWithDescriptions.filter(item => item.description !== 'No description available').length} articles`);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.status(200).json(itemsWithDescriptions);

  } catch (error) {
    console.error('Scraping error:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch news', 
      details: error.message,
      url: 'https://apisinhala.newsfirst.lk/post/PostPagination/0/5'
    });
  }
};
