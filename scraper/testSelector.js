const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: false }); // Open browser for visual check
  const page = await browser.newPage();

  console.log(`🚀 Navigating to Pixabay Music Page...`);
  await page.goto('https://pixabay.com/music/', { waitUntil: 'networkidle2' });

  // Take a screenshot for debugging
  await page.screenshot({ path: 'debug.png' });
  console.log('📸 Screenshot saved as debug.png. Check to verify content.');

  // Debug and print element class names
  const elements = await page.$$('div');
  for (const el of elements) {
    const className = await el.evaluate((e) => e.className);
    if (className.includes('audioRow')) {
      console.log(`✅ Found matching class: ${className}`);
    }
  }

  await browser.close();
})();
