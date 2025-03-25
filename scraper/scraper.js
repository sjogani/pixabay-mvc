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
const CONCURRENCY_LIMIT = 5;

// Scrape and download songs using Puppeteer
async function scrapeSongs(limit = 5) {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  console.log(`🚀 Navigating to Pixabay Music Page...`);
  await page.goto('https://pixabay.com/music/', { waitUntil: 'networkidle2' });

  // Wait for song cards to load
  await page.waitForSelector('div.audioRow--nAm4Z', { visible: true, timeout: 120000 });

  console.log(`🎵 Scraping metadata and extracting download URLs for ${limit} songs...`);

  // Get song metadata and detail page URLs from the main page
  const songs = await getSongMetadata(page, limit);

  if (songs.length === 0) {
    console.error('❌ No songs found! Check if the URL is correct.');
    await browser.close();
    return;
  }

  console.log(`✅ Found ${songs.length} songs. Extracting audio URLs...`);

  // Extract download URLs by visiting individual song pages
  await extractAudioUrls(browser, songs);

  // Process songs with parallel downloads
  await processSongsInParallel(songs);

  console.log(`🎉 Downloaded ${songs.length} songs successfully!`);
  await browser.close();
}

// Extract metadata and song URLs from the main page
async function getSongMetadata(page, limit) {
  const songElements = await page.$$('div.audioRow--nAm4Z');
  console.log(`🔎 Found ${songElements.length} song cards. Scraping data...`);

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

    console.log({ title, author, duration, detailUrl });
    console.log(`🎼 Song Found: ${title} by ${author}, Duration: ${duration}`);
    if (detailUrl) {
      songs.push({ title, author, duration, detailUrl, audioUrl: null });
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
    console.log(`🔍 Extracting download URL for: ${song.title}`);
    await page.goto(song.detailUrl, { waitUntil: 'networkidle2' });

    // Screenshot for debugging
    const screenshotPath = path.join(DEBUG_DIR, `${song.title.replace(/[^a-zA-Z0-9]/g, '_')}.png`);
    await page.screenshot({ path: screenshotPath });
    console.log(`📸 Screenshot captured: ${screenshotPath}`);

    // Try capturing MP3 URL via interception
    const audioUrl = await captureMp3Url(page);
    if (audioUrl) {
      console.log(`🎧 Found audio URL for ${song.title}: ${audioUrl}`);
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

    page.on('response', async (response) => {
      const requestUrl = response.url();
      if (requestUrl.endsWith('.mp3')) {
        console.log(`✅ MP3 URL Intercepted: ${requestUrl}`);
        audioUrl = requestUrl;
        resolve(audioUrl);
      }
    });

    // Click play to trigger audio requests
    const playButton = await page.$(
      'button[aria-label="paused"], button.playIcon--3-Qup, .container--vGyBg'
    );

    if (playButton) {
      console.log('▶️ Clicking play button to trigger audio...');
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
            console.log(`⚠️ Skipping ${song.title}: Already in the database.`);
            return;
          }

          // ✅ Check if file already exists to avoid re-download
          const filename = `${song.title.replace(/[^a-zA-Z0-9]/g, '_')}.mp3`;
          const filePath = path.join(DOWNLOAD_DIR, filename);
          if (fs.existsSync(filePath)) {
            console.log(`⚠️ Skipping download: ${filename} already exists.`);
            return;
          }

          // ✅ Insert metadata into MySQL
          const songId = await insertSongMaster({
            title: song.title,
            filename,
            audioOwnerName: song.author || 'Unknown Author',
            duration: song.duration,
          });
          console.log(`✅ Inserted metadata for: ${song.title}, ID: ${songId}`);

          // ✅ Download MP3 after successful insertion
          await downloadSong(song.audioUrl, filename);

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
