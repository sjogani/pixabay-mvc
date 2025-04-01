const fs = require('fs');
const path = require('path');
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

const FAILED_SONGS_FILE = './songs_error.json'; // Final JSON file
const JSON_FILE = './songs_metadata.json';

// ✅ Read JSON data from file
const rawData = fs.readFileSync(JSON_FILE, 'utf-8');
const songs = JSON.parse(rawData);

const failedSongs = [];

console.log(`✅ Loaded ${songs.length} songs from JSON.`);

function readFailedSongs() {
  if (fs.existsSync(FAILED_SONGS_FILE)) {
    const existingData = fs.readFileSync(FAILED_SONGS_FILE, 'utf-8');
    return existingData ? JSON.parse(existingData) : [];
  }
  return [];
}


// ✅ Insert or get ID for genre, mood, or theme
async function insertOrGetId(table, name) {
  if (!name || name === 'Unknown') return null;
  return await checkIfExists(table, name);
}

// ✅ Insert and link genres, moods, and themes with song
async function insertSongWithFilters(song) {
  try {

    const songExists = await checkIfSongExists(song.title, song.audioOwnerName || 'Unknown Author');
    if (songExists) {
      console.log(`⚠️ Skipping ${song.title} by ${song.audioOwnerName}: Already exists in the database.`);
      return; // Skip if song already exists
    }

    // ✅ Insert song metadata into song_masters
    const songId = await insertSongMaster({
      title: song.title,
      filename: `${song.title.replace(/[^a-zA-Z0-9]/g, '_')}.mp3`,
      audioOwnerName: song.audioOwnerName || 'Unknown Author',
      duration: song.duration || '0:00',
      audioUrl: song.audioUrl,
      coverImageUrl: song.coverImageUrl || null,
      coverfilename: song.coverfilename || null,
    });

    //console.log(`🎵 Inserted song: ${song.title}, ID: ${songId}`);

    // ✅ Link genres
    for (const genre of song.genres.filter((genre) => genre && genre !== 'Unknown')) {
      const genreId = await insertOrGetId('generic_masters', genre);
      if (genreId) {
        await linkSongGeneric(songId, genreId);
      }
    }

    // ✅ Link moods
    for (const mood of song.moods.filter((mood) => mood && mood !== 'Unknown')) {
      const moodId = await insertOrGetId('mood_masters', mood);
      if (moodId) {
        await linkSongMood(songId, moodId);
      }
    }

    // ✅ Link themes
    for (const theme of song.themes.filter((theme) => theme && theme !== 'Unknown')) {
      const themeId = await insertOrGetId('theme_masters', theme);
      if (themeId) {
        await linkSongTheme(songId, themeId);
      }
    }

    //console.log(`✅ Filters linked successfully for: ${song.title}`);
  } catch (error) {
    console.error(`❌ Error inserting song: ${song.title}`, error.message);
    failedSongs.push(song);
  }
}

// ✅ Process and insert all songs with filters
async function processSongs() {
  for (const song of songs) {
    await insertSongWithFilters(song);
  }
  //console.log('✅ All songs and filters processed successfully!');

  if (failedSongs.length > 0) {
    const existingFailedSongs = readFailedSongs(); // Read existing failed songs
    const updatedFailedSongs = [...existingFailedSongs, ...failedSongs];

    fs.writeFileSync(FAILED_SONGS_FILE, JSON.stringify(updatedFailedSongs, null, 2));
    console.log(`❌ Some songs failed to insert. See ${FAILED_SONGS_FILE} for details.`);
  } else {
    //console.log('✅ All songs inserted successfully!');
  }
}

// Run the script
processSongs().catch((err) => {
  console.error('❌ Error processing songs:', err.message);
});
