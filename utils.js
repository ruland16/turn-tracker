function localDate() {
  return new Date().toLocaleDateString('en-CA', {
    timeZone: process.env.TIMEZONE || 'UTC',
  });
}

module.exports = { localDate };
