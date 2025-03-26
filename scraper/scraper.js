const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const {
  insertSongMaster,
  insertGenericMaster,
  insertMoodMaster,
  insertThemeMaster,
  linkSongGeneric,
  linkSongMood,
  linkSongTheme,
  checkIfSongExists, // ✅ New function to check if song exists
} = require('../models/songModel');

// Download and debug directories
const DOWNLOAD_DIR = path.join('D:\\pixabay_downloads');
const DEBUG_DIR = path.join('D:\\pixabay_debug');

// Create directories if they don’t exist
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(DEBUG_DIR)) {
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
}

// Parallel download limit
const CONCURRENCY_LIMIT = 20;

const COOLDOWN_AFTER_PAGES = 10; // ✅ Cooldown every 10 pages
const COOLDOWN_DURATION_MS = 30000; // ✅ 30 seconds cooldown

// Scrape and download songs using Puppeteer
async function scrapeSongs(limit = 5, maxPages = 25) {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  console.log(`🚀 Navigating to Pixabay Music Page...`);
  await page.goto('https://pixabay.com/music/search/?order=ec', { waitUntil: 'networkidle2' });

  let totalSongs = []; // ✅ Store all songs across pages
  let currentPage = 1;

  // ✅ Scrape multiple pages until limit or maxPages is reached
  while (totalSongs.length < limit && currentPage <= maxPages) {
    console.log(`🔎 Scraping page ${currentPage}...`);

    // ✅ Scroll down to load all records on the current page
    await autoScroll(page);

    // ✅ Wait for song cards to load
    await page.waitForSelector('div.audioRow--nAm4Z', { visible: true, timeout: 120000 });

    // ✅ Get metadata from the current page
    const songs = await getSongMetadata(page, limit - totalSongs.length);
    totalSongs = totalSongs.concat(songs);

    // ✅ Check cooldown condition
    if (currentPage % COOLDOWN_AFTER_PAGES === 0) {
      console.log(`⏸️ Cooldown for ${COOLDOWN_DURATION_MS / 1000} seconds to avoid rate limits...`);
      await new Promise((resolve) => setTimeout(resolve, COOLDOWN_DURATION_MS));

    }

    // ✅ Check if limit is reached after current page
    if (totalSongs.length >= limit) {
      break; // 🎉 Limit reached, exit pagination
    }

    // ✅ Check and navigate to the next page if available
    const hasNextPage = await goToNextPage(page);
    if (!hasNextPage) {
      console.log(`🚫 No more pages available. Stopping at page ${currentPage}.`);
      break;
    }

    currentPage++;
  }

  if (totalSongs.length === 0) {
    console.error('❌ No songs found! Check if the URL is correct or pagination is blocked.');
    await browser.close();
    return;
  }

  //console.log(`✅ Found ${totalSongs.length} songs. Extracting audio URLs...`);

  // ✅ Extract download URLs by visiting individual song pages
  await extractAudioUrls(browser, totalSongs);

  // ✅ Process songs with parallel downloads
  await processSongsInParallel(totalSongs);

  console.log(`🎉 Downloaded ${totalSongs.length} songs successfully!`);
  await browser.close();
}

/*async function goToNextPage(page) {
  const nextPageSelector = 'a[rel="next"]'; // Button to go to the next page
  const nextPageExists = await page.$(nextPageSelector);

  if (nextPageExists) {
    console.log('➡️ Moving to the next page...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }),
      page.click(nextPageSelector),
    ]);
    return true; // ✅ Successfully navigated to the next page
  } else {
    console.warn('⚠️ No next page found.');
    return false; // 🚫 No more pages
  }
}*/


async function goToNextPage(page) {
  try {
    // ✅ Check if the next button exists and is visible
    const nextButton = await page.$('a[rel="next"]');
    if (!nextButton) {
      console.log('🚫 No next page button found. Stopping...');
      return false;
    }

    // ✅ Check if button is disabled
    const isDisabled = await page.evaluate(
      (button) => button.hasAttribute('disabled'),
      nextButton
    );
    if (isDisabled) {
      console.log('🚫 Next page button is disabled. Stopping...');
      return false;
    }

    console.log('➡️ Going to the next page...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }),
      nextButton.click(), // ✅ Click next button
    ]);

    return true;
  } catch (error) {
    console.error(`❌ Error navigating to the next page: ${error.message}`);
    return false;
  }
}



// Extract metadata and song URLs from the main page
async function getSongMetadata(page, limit) {
  const songElements = await page.$$('div.audioRow--nAm4Z');
  //console.log(`🔎 Found ${songElements.length} song cards. Scraping data...`);

  const songs = [];
  for (let i = 0; i < Math.min(songElements.length, limit); i++) {
    const element = songElements[i];

    const title = await element.evaluate((el) => {
      const titleElement = el.querySelector('.title--7N7Nr');
      return titleElement ? titleElement.innerText.trim() : 'Unknown Title';
    });

    const author = await element.evaluate((el) => {
      const authorElement = el.querySelector('.name--yfZpi');
      return authorElement ? authorElement.innerText.trim() : 'Unknown Author';
    });

    const duration = await element.evaluate((el) => {
      const durationElement = el.querySelector('.duration--bLi2C');
      return durationElement ? durationElement.innerText.trim() : '0:00';
    });

    const detailUrl = await element.evaluate((el) => {
      const linkElement = el.querySelector('a[href*="/music/"]');
      return linkElement ? linkElement.href : null;
    });

    // ✅ Extract cover image URL
    const coverImageUrl = await element.evaluate((el) => {
      const imgElement = el.querySelector('img');
      return imgElement ? imgElement.src : null;
    });

    //console.log({ title, author, duration, detailUrl, coverImageUrl });
    //console.log(`🎼 Song Found: ${title} by ${author}, Duration: ${duration}`);
    if (detailUrl) {
      songs.push({ title, author, duration, detailUrl, coverImageUrl, audioUrl: null, coverfilename: null });
    } else {
      console.warn(`⚠️ No URL found for: ${title}`);
    }
  }

  return songs;
}

// Visit individual song pages to extract download URL
async function extractAudioUrls(browser, songs) {
  const page = await browser.newPage();

  for (const song of songs) {
    //console.log(`🔍 Extracting download URL for: ${song.title}`);
    await page.goto(song.detailUrl, { waitUntil: 'networkidle2' });

    // Screenshot for debugging
    /*const screenshotPath = path.join(DEBUG_DIR, `${song.title.replace(/[^a-zA-Z0-9]/g, '_')}.png`);
    await page.screenshot({ path: screenshotPath });
    console.log(`📸 Screenshot captured: ${screenshotPath}`);*/

    // Try capturing MP3 URL via interception
    const audioUrl = await captureMp3Url(page);
    if (audioUrl) {
      //console.log(`🎧 Found audio URL for ${song.title}: ${audioUrl}`);
      song.audioUrl = audioUrl;
      continue;
    }

    // Fallback to <audio> element extraction
    const fallbackAudioUrl = await page.evaluate(() => {
      const audioElement = document.querySelector('audio > source, audio');
      return audioElement ? audioElement.src : null;
    });

    if (fallbackAudioUrl) {
      console.log(`🎧 Fallback URL found for ${song.title}: ${fallbackAudioUrl}`);
      song.audioUrl = fallbackAudioUrl;
    } else {
      console.warn(`⚠️ No audio URL found for: ${song.title}`);
    }
  }

  await page.close();
}

// Capture MP3 URL function
async function captureMp3Url(page) {
  return new Promise(async (resolve) => {
    let audioUrl = null;

    page.setDefaultTimeout(180000);

    page.on('response', async (response) => {
      const requestUrl = response.url();
      if (requestUrl.endsWith('.mp3')) {
        //console.log(`✅ MP3 URL Intercepted: ${requestUrl}`);
        audioUrl = requestUrl;
        resolve(audioUrl);
      }
    });

    // Click play to trigger audio requests
    const playButton = await page.$(
      'button[aria-label="paused"], button.playIcon--3-Qup, .container--vGyBg'
    );

    if (playButton) {
      //console.log('▶️ Clicking play button to trigger audio...');
      await playButton.click();
      await new Promise((resolve) => setTimeout(resolve, 7000)); // Wait to capture MP3 URL
    } else {
      console.warn('⚠️ Play button not found.');
      resolve(null);
    }

    setTimeout(() => {
      if (!audioUrl) {
        console.warn('⚠️ No audio URL captured. Resolving with null.');
        resolve(null);
      }
    }, 10000);
  });
}

// ✅ Check if song exists and process in parallel
async function processSongsInParallel(songs) {
  for (let i = 0; i < songs.length; i += CONCURRENCY_LIMIT) {
    const batch = songs.slice(i, i + CONCURRENCY_LIMIT);
    await Promise.all(
      batch.map(async (song) => {
        try {
          // ✅ Skip if song already exists in the database
          const songExists = await checkIfSongExists(song.title, song.author);
          if (songExists) {
            //console.log(`⚠️ Skipping ${song.title}: Already in the database.`);
            return;
          }

          // ✅ Check if file already exists to avoid re-download
          const filename = `${song.title.replace(/[^a-zA-Z0-9]/g, '_')}.mp3`;
          const filePath = path.join(DOWNLOAD_DIR, filename);
          if (fs.existsSync(filePath)) {
            //console.log(`⚠️ Skipping download: ${filename} already exists.`);
            return;
          }

          let coverfilename = null;

          if (song.coverImageUrl) {
            song.coverfilename = `${song.title.replace(/[^a-zA-Z0-9]/g, "_")}.jpg`;
          }

          // ✅ Insert metadata into MySQL
          const songId = await insertSongMaster({
            title: song.title,
            filename,
            audioOwnerName: song.author || 'Unknown Author',
            duration: song.duration,
            audioUrl: song.audioUrl, // ✅ Correctly passing audio URL
            coverImageUrl: song.coverImageUrl || null,
            coverfilename: song.coverfilename || null,
          });
          console.log(`✅ Inserted metadata for: ${song.title}, ID: ${songId}`);

          // ✅ Download MP3 after successful insertion
          //await downloadSong(song.audioUrl, filename);

          // ✅ Insert genre, mood, and theme if needed
          const genericId = await insertGenericMaster('Chill');
          const moodId = await insertMoodMaster('Relaxing');
          const themeId = await insertThemeMaster('Nature');

          // ✅ Link song to generics, moods, and themes
          await linkSongGeneric(songId, genericId);
          await linkSongMood(songId, moodId);
          await linkSongTheme(songId, themeId);
        } catch (error) {
          console.error(`❌ Error processing song: ${song.title}`, error.message);
        }
      })
    );
    await new Promise((resolve) =>
      setTimeout(resolve, 5000 + Math.random() * 3000) );
  }
}

async function autoScroll(page) {
  try {
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight - window.innerHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });
  } catch (error) {
    console.warn(`⚠️ Scroll interrupted or navigation occurred: ${error.message}`);
  }
}


// Download song and save it in D:\pixabay_downloads
async function downloadSong(url, filename) {
  const filePath = path.join(DOWNLOAD_DIR, filename);
  try {
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream',
    });

    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        console.log(`🎧 Downloaded: ${filename}`);
        resolve();
      });
      writer.on('error', (error) => {
        console.error(`❌ Error downloading ${filename}:`, error.message);
        reject(error);
      });
    });
  } catch (error) {
    console.error(`❌ Failed to download ${filename}`, error.message);
    return Promise.reject(error);
  }
}

// Run scraper with default params (limit = 5)
const args = process.argv.slice(2);
const count = parseInt(args[0]) || 5;
scrapeSongs(count);
