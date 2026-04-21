import { Events, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { botConfig, getColor } from '../config/bot.js';
import { logger } from '../utils/logger.js';

// Allowed attachment content-type prefixes
const MEDIA_CONTENT_TYPES = ['image/', 'video/'];

// Allowed embed types that count as media
const MEDIA_EMBED_TYPES = ['image', 'video', 'gifv', 'article'];

/**
 * Determines whether a message contains only media (images, videos, files).
 * Returns true if the message is media-only and should be kept.
 */
function isMediaMessage(message) {
  // Messages with attachments are always allowed
  if (message.attachments.size > 0) {
    return true;
  }

  // Messages with media embeds (images, videos, GIFs) are allowed
  if (message.embeds.length > 0) {
    const hasMediaEmbed = message.embeds.some(embed =>
      MEDIA_EMBED_TYPES.includes(embed.data?.type) ||
      embed.image ||
      embed.video ||
      embed.thumbnail
    );
    if (hasMediaEmbed) return true;
  }

  // Plain text with no attachments/embeds is not media
  return false;
}

export default {
  name: Events.MessageCreate,
  once: false,

  async execute(message, client) {
    try {
      // Ignore bots and DMs
      if (message.author?.bot || !message.guild) return;

      const mediaOnlyChannels = botConfig?.specialized?.mediaOnlyChannels ?? [];
      if (!mediaOnlyChannels.includes(message.channel.id)) return;

      // Allow media messages through
      if (isMediaMessage(message)) return;

      // Check bot permissions before attempting to delete
      const me = message.guild.members.me;
      const perms = me ? message.channel.permissionsFor(me) : null;
      if (!perms?.has([PermissionFlagsBits.ManageMessages, PermissionFlagsBits.SendMessages])) {
        logger.warn(
          `[MEDIA_ONLY] Missing ManageMessages or SendMessages in channel ${message.channel.id}`
        );
        return;
      }

      // Delete the non-media message
      await message.delete().catch(err =>
        logger.warn(`[MEDIA_ONLY] Failed to delete message ${message.id}: ${err.message}`)
      );

      // Send a temporary warning to the author
      const warning = await message.channel
        .send({
          content: `${message.author}, this channel is **media only**. Please post images, videos, or files only.`,
        })
        .catch(() => null);

      // Auto-delete the warning after 8 seconds
      if (warning) {
        setTimeout(() => {
          warning.delete().catch(() => {});
        }, 8000);
      }

      logger.info(
        `[MEDIA_ONLY] Deleted non-media message from ${message.author.tag} in #${message.channel.name} (guild: ${message.guild.id})`
      );
    } catch (error) {
      logger.error('[MEDIA_ONLY] Error in mediaOnly event:', error);
    }
  },
};
