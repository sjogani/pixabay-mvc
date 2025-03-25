const express = require('express');
const {
  fetchSongs,
  addSong,
  addMultipleSongs,
} = require('../controllers/songController');

const router = express.Router();

// Routes
router.get('/songs', fetchSongs);
router.post('/song', addSong);
router.post('/songs', addMultipleSongs);

module.exports = router;
