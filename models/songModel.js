const pool = require('../config/db');

// Insert song into song_masters
async function insertSongMaster(song) {
  const query = `
    INSERT INTO song_masters (title, audiofilename, audioOwnerName, audioduration, audioUrl, coverImageUrl, coverfilename)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  const values = [song.title, song.filename, song.audioOwnerName, song.duration, song.audioUrl,
    song.coverImageUrl,
    song.coverfilename || null];
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

async function checkIfExists(tableName, name) {
    
    // Check if entry already exists
    const query = `SELECT id FROM ${tableName} WHERE name = ? LIMIT 1`;
    const [rows] = await pool.query(query, [name]);
    
    if (rows.length) {
      //console.log(`✅ ${name} already exists in ${tableName}, ID: ${rows[0].id}`);
      return rows[0].id;
    }
    
    // If not found, insert new entry
    const insertQuery = `
    INSERT INTO ${tableName} (name)
    VALUES (?)
    ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)
  `;

  const [result] = await pool.query(insertQuery, [name]);
    //console.log('maybe'+result.insertId);
    //console.log(`✅ Inserted ${name} into ${tableName}, ID: ${result.insertId}`);
    return result.insertId;
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
  checkIfExists,
};
