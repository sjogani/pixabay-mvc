const { getAllSongs, insertSong, insertMultipleSongs } = require('../models/songModel');

// Get all songs
async function fetchSongs(req, res) {
  try {
    const songs = await getAllSongs();
    res.json(songs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Add single song
async function addSong(req, res) {
  const { title, url, duration } = req.body;
  try {
    const result = await insertSong(title, url, duration);
    res.json({ message: 'Song added successfully', result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Add multiple songs
async function addMultipleSongs(req, res) {
  const { songs } = req.body;
  try {
    const result = await insertMultipleSongs(songs);
    res.json({ message: `${songs.length} songs added successfully`, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  fetchSongs,
  addSong,
  addMultipleSongs,
};
