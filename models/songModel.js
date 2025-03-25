const pool = require('../config/db');

// Insert song into song_masters
async function insertSongMaster(song) {
  const query = `
    INSERT INTO song_masters (title, audiofilename, audioOwnerName, audioduration)
    VALUES (?, ?, ?, ?)
  `;
  const values = [song.title, song.filename, song.audioOwnerName, song.duration];
  const [result] = await pool.query(query, values);
  return result.insertId;
}

// Insert generic if not exists and return ID
async function insertGenericMaster(name) {
  const query = `
    INSERT INTO generic_masters (name) VALUES (?)
    ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
  `;
  const [result] = await pool.query(query, [name]);
  return result.insertId;
}

// Insert mood if not exists and return ID
async function insertMoodMaster(name) {
  const query = `
    INSERT INTO mood_masters (name) VALUES (?)
    ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
  `;
  const [result] = await pool.query(query, [name]);
  return result.insertId;
}

// Insert theme if not exists and return ID
async function insertThemeMaster(name) {
  const query = `
    INSERT INTO theme_masters (name) VALUES (?)
    ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
  `;
  const [result] = await pool.query(query, [name]);
  return result.insertId;
}

// Link song to generic
async function linkSongGeneric(songId, genericId) {
  const query = `
    INSERT IGNORE INTO song_generic (song_id, generic_id) VALUES (?, ?)
  `;
  await pool.query(query, [songId, genericId]);
}

// Link song to mood
async function linkSongMood(songId, moodId) {
  const query = `
    INSERT IGNORE INTO song_mood (song_id, mood_id) VALUES (?, ?)
  `;
  await pool.query(query, [songId, moodId]);
}

async function checkIfSongExists(title, author) {
    const query = `
      SELECT id FROM song_masters
      WHERE title = ? AND audioOwnerName = ?
      LIMIT 1
    `;
    const [rows] = await pool.query(query, [title, author]);
    return rows.length > 0;
  }

// Link song to theme
async function linkSongTheme(songId, themeId) {
  const query = `
    INSERT IGNORE INTO song_theme (song_id, theme_id) VALUES (?, ?)
  `;
  await pool.query(query, [songId, themeId]);
}

module.exports = {
  insertSongMaster,
  insertGenericMaster,
  insertMoodMaster,
  insertThemeMaster,
  linkSongGeneric,
  linkSongMood,
  linkSongTheme,
  checkIfSongExists,
};
