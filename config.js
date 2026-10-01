require('dotenv').config();

module.exports = {
  token: process.env.BOT_TOKEN,
  ownerId: parseInt(process.env.OWNER_ID),
  channels: (process.env.CHANNELS || "").split(","),
  photourl: process.env.PHOTO_URL
};
