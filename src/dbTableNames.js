const suffix = process.env.DB_TABLE_SUFFIX || '';

if (suffix && !/^_[a-z0-9_]+$/i.test(suffix)) {
  throw new Error('DB_TABLE_SUFFIX must be empty or start with an underscore and contain only letters, numbers, and underscores.');
}

function dbName(baseName) {
  return `${baseName}${suffix}`;
}

module.exports = { dbName, suffix };
