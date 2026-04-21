import { logger } from '../utils/logger.js';

export const botConfig = {
  prefix: "/",

  // =========================
  // ONLINE STATUS
  // =========================
  presence: {
    "online" = green dot
    "idle" = yellow moon
      "dnd"= red do-not-disturb
// - "invisible" = appears offline

presence: {

// Current online state shown on Discord.

status: "dnd",

// Activity lines shown under the bot name.

// `type` number mapping from Discord:

// 0 = Playing
// 1 = Streaming
// 2 = Listening
// 3 = Watching
// 4 = Custom
// 5 = Competing

activities: [

{

// Text users will see (example: "Playing /help | String Edits Bot").

name: "string edits",

// Activity type number (0 = Playing).

type: 2,

},

],

},

  // =========================
  // BRANDING & EMBEDS
  // =========================
  embeds: {
    colors: {
      primary: "#59BF9D",
      success: "#57F287",
      error: "#ED4245",
      info: "#3498DB",
      dark: "#202225",
    },
    footer: {
      text: "Sapphire AI",
      icon: null,
    }
  },

  // =========================
  // WELCOME SYSTEM
  // =========================
  welcome: {
    enabled: true,
    channelId: process.env.WELCOME_CHANNEL_ID || null,
    message: "Welcome {user} to the server! Use /verify to get started.",
  },

  // =========================
  // SPECIALIZED CHANNELS (Media & Edits)
  // =========================
  specialized: {
    mediaOnlyChannels: ["1234567890"], // Put your Media Channel ID here
    rateEditsChannel: ["0987654321"],  // Put your Rate Edits Channel ID here
  },

  // =========================
  // LOGGING & MODERATION
  // =========================
  logging: {
    enabled: true,
    modLogChannel: process.env.MOD_LOG_CHANNEL_ID || null,
  },

  // =========================
  // FEATURE TOGGLES
  // =========================
  features: {
    moderation: true,
    logging: true,
    welcome: true,
    reactionRoles: true,
    verification: true,
    // Disabled the bloat
    economy: false,
    leveling: false,
    tickets: true,
    giveaways: false,
    counter: false,
  },
};

// =========================
// VALIDATION & UTILITIES
// =========================
export function validateConfig(config) {
  const errors = [];
  if (!process.env.DISCORD_TOKEN && !process.env.TOKEN) {
    errors.push("Missing DISCORD_TOKEN in .env");
  }
  if (!process.env.CLIENT_ID) {
    errors.push("Missing CLIENT_ID in .env");
  }
  return errors;
}

export function getColor(path, fallback = "#59BF9D") {
  if (typeof path === "string" && path.startsWith("#")) {
    return parseInt(path.replace("#", ""), 16);
  }
  const result = path.split(".").reduce((obj, key) => (obj && obj[key] !== undefined ? obj[key] : fallback), botConfig.embeds.colors);
  return typeof result === "string" && result.startsWith("#") ? parseInt(result.replace("#", ""), 16) : result;
}

const configErrors = validateConfig(botConfig);
if (configErrors.length > 0) {
  logger.error("Config Errors:", configErrors.join("\n"));
  process.exit(1);
}

export default botConfig;




