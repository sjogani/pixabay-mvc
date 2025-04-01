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
  checkIfExists,
  checkIfSongExists, // ✅ New function to check if song exists
} = require('../models/songModel');

// Download and debug directories
const DOWNLOAD_DIR = path.join('D:\\pixabay_downloads');
const OUTPUT_JSON = './songs_metadata.json'; // Final JSON file
const DEBUG_DIR = path.join('D:\\pixabay_debug');

const { exec } = require('child_process');

// Create directories if they don’t exist
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(DEBUG_DIR)) {
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
}

// Parallel download limit
const CONCURRENCY_LIMIT = 10;

const COOLDOWN_AFTER_PAGES = 10; // ✅ Cooldown every 10 pages
const COOLDOWN_DURATION_MS = 30000; // ✅ 30 seconds cooldown


// Scrape and download songs using Puppeteer
async function scrapeSongs(limit = 5, maxPages = 50) {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  console.log(`🚀 Navigating to Pixabay Music Page...`);
  await page.goto('https://pixabay.com/music/search/?order=ec', { waitUntil: 'networkidle2' });


  let totalSongs = []; // ✅ Store all songs across pages
  let prevPageSongs = [];
  let currentPage = 1;

  // ✅ Scrape multiple pages until limit or maxPages is reached
  while (totalSongs.length < limit && currentPage <= maxPages) {
    console.log(`🔎 Scraping page ${currentPage}...`);

    // ✅ Scroll down to load all records on the current page
    await autoScroll(page);

    // ✅ Wait for song cards to load
    await page.waitForSelector('div.audioRow--nAm4Z', { visible: true, timeout: 120000 });

    // ✅ Get metadata from the current page
    try {
      const currentSongs = await getSongMetadata(page, limit - totalSongs.length);
      
      const songsToProcess = [...prevPageSongs, ...currentSongs];
      // ✅ Extract download URLs by visiting individual song pages
      await extractAudioUrls(browser, songsToProcess);

      // ✅ Process songs with parallel downloads
      await processSongsInParallel(songsToProcess);

      totalSongs = totalSongs.concat(currentSongs);
      prevPageSongs = [...currentSongs];
    } catch (error) {
      console.error(`❌ Error while processing songs on page ${currentPage}: ${error.message}`);
    }

    // ✅ Check cooldown condition
    if (currentPage % COOLDOWN_AFTER_PAGES === 0) {
      console.log(`⏸️ Cooldown for ${COOLDOWN_DURATION_MS / 1000} seconds to avoid rate limits...`);
      await new Promise((resolve) => setTimeout(resolve, COOLDOWN_DURATION_MS));

    }

    // ✅ Check if limit is reached after current page
    if (totalSongs.length >= limit) {
      break; // 🎉 Limit reached, exit pagination
    }

     // ✅ Extract download URLs by visiting individual song pages
    //await extractAudioUrls(browser, totalSongs);

    


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

 
  console.log(`🎉 Downloaded ${totalSongs.length} songs successfully!`);
  await browser.close();
}

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

    //console.log('➡️ Going to the next page...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 120000 }),
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

    /*const genre = await element.evaluate((el) => {
      const genreElement = el.querySelector('a[href*="/music/search/genre/"]');
      return genreElement ? genreElement.innerText.trim() : 'Unknown';
    });*/

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
      try {
      //console.log(`🔍 Extracting download URL for: ${song.title}`);
      
      // ✅ Try navigating to song detail URL
      await page.goto(song.detailUrl, { waitUntil: 'networkidle2', timeout: 180000 });
    } catch (error) {
      if (error.name === 'TimeoutError') {
        console.warn(`⚠️ Timeout while loading: ${song.detailUrl}. Skipping this song...`);
        continue; // Skip this song if navigation fails
      } else {
        console.error(`❌ Error navigating to song URL: ${error.message}`);
        continue; // Skip and proceed with next song
      }
    }
      // ✅ Extract multiple genres
      song.genres = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href*="/genre/"] span.label--Ngqjq'))
          .map((el) => el.innerText.trim())
          .filter((name) => name);
      });

      //console.log(song.genres);

      // ✅ Extract multiple moods
      song.moods = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href*="/mood/"] span.label--Ngqjq'))
          .map((el) => el.innerText.trim())
          .filter((name) => name);
      });

      //console.log(song.moods);

      // ✅ Extract multiple themes
      song.themes = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href*="/theme/"] span.label--Ngqjq'))
          .map((el) => el.innerText.trim())
          .filter((name) => name);
      });

      //console.log(song.themes);
      //console.log('next');
      // Try capturing MP3 URL via interception
      const audioUrl = await captureMp3Url(page);
      if (audioUrl) {
        //console.log(`🎧 Found audio URL for ${song.title}: ${audioUrl}`);
        song.audioUrl = audioUrl;
        continue;
      }
      
      await new Promise((resolve) => setTimeout(resolve, 3000));

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
    // ✅ Wait for play button to appear
    await page.waitForSelector(
      'button[aria-label="paused"], button.playIcon--3-Qup, .container--vGyBg',
      { visible: true }
    );

    try{
    // ✅ Query again before clicking to avoid detachment
    const playButton = await page.$(
      'button[aria-label="paused"], button.playIcon--3-Qup, .container--vGyBg'
    );

    if (playButton) {
      // ✅ Click button safely
      await playButton.click();

      // ⏳ Wait for 7 seconds to allow audio to load
      await new Promise((resolve) => setTimeout(resolve, 12000));
    } 
  }catch {
    if (error.name === 'TimeoutError'){
      console.warn('⚠️ Play button not found.');
    }
    }


    setTimeout(() => {
      if (!audioUrl) {
        console.warn('⚠️ No audio URL captured. Resolving with null.');
        resolve(null);
      }
    }, 20000);
  });
}

// ✅ Check if song exists and process in parallel
async function processSongsInParallel(songs) {
  let allSongsData = [];
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
          /*const songId = await insertSongMaster({
            title: song.title,
            filename,
            audioOwnerName: song.author || 'Unknown Author',
            duration: song.duration,
            audioUrl: song.audioUrl, // ✅ Correctly passing audio URL
            coverImageUrl: song.coverImageUrl || null,
            coverfilename: song.coverfilename || null,
          });*/

          const songMetadata = {
            title: song.title,
            filename,
            audioOwnerName: song.author || 'Unknown Author',
            duration: song.duration,
            audioUrl: song.audioUrl, // ✅ Correctly passing audio URL
            coverImageUrl: song.coverImageUrl || null,
            coverfilename: song.coverfilename || null,
            genres: song.genres.filter((genre) => genre && genre !== 'Unknown'),
            moods: song.moods.filter((mood) => mood && mood !== 'Unknown'),
            themes: song.themes.filter((theme) => theme && theme !== 'Unknown'),
          };

          // ✅ Add metadata to allSongsData
          allSongsData.push(songMetadata);
          

          // ✅ Download MP3 after successful insertion
          //await downloadSong(song.audioUrl, filename);

          //console.log(`✅ Inserted metadata for: ${song.title}`);
        } catch (error) {
          console.error(`❌ Error processing song: ${song.title}`, error.message);
        }
        
      })
    );

    fs.writeFileSync(OUTPUT_JSON, JSON.stringify(allSongsData, null, 2));

    exec('node scraper/metadataScraper.js', (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ Error running metadataScraper.js: ${error.message}`);
        return;
      }
      console.log(stdout);
    });

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
