const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: false }); // Open browser with UI
  const page = await browser.newPage();

  console.log(`🚀 Navigating to Pixabay Music Page...`);
  await page.goto('https://pixabay.com/music/', { waitUntil: 'networkidle2', timeout: 120000 });

  console.log(`📝 Fetching page HTML...`);
  const htmlContent = await page.content(); // Get the full page HTML

  // Save HTML to a local file for manual inspection
  const fs = require('fs');
  fs.writeFileSync('scraper/pixabay_music.html', htmlContent);
  console.log('✅ HTML content saved to scraper/pixabay_music.html');

  await browser.close();
})();
