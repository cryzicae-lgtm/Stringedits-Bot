/**
 * Boost Message — guildMemberBoost listener
 *
 * Listens for the custom `guildMemberBoost` event emitted by guildMemberUpdate.js
 * when a member starts boosting the server. Sends a boost notification embed
 * to the configured boost channel (botConfig.welcome.channelId or a dedicated
 * boost channel if set).
 *
 * Tracks the current boost count and tier from the guild object.
 */
import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { botConfig, getColor } from '../config/bot.js';
import { logger } from '../utils/logger.js';

// Tier thresholds for display
const BOOST_TIERS = {
  0: 'No Tier',
  1: 'Tier 1',
  2: 'Tier 2',
  3: 'Tier 3',
};

export default {
  // Custom event emitted from guildMemberUpdate.js
  name: 'guildMemberBoost',
  once: false,

  async execute(member, client) {
    try {
      const { guild, user } = member;

      // Resolve the boost notification channel.
      // Priority: botConfig.boostChannelId → botConfig.welcome.channelId
      const boostChannelId =
        botConfig?.boostChannelId ?? botConfig?.welcome?.channelId ?? null;

      if (!boostChannelId) {
        logger.debug('[BOOST] No boost channel configured, skipping boost message.');
        return;
      }

      const channel = guild.channels.cache.get(boostChannelId);
      if (!channel?.isTextBased?.()) return;

      // Permission check
      const me = guild.members.me;
      const perms = me ? channel.permissionsFor(me) : null;
      if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
        logger.warn(`[BOOST] Missing permissions in boost channel ${boostChannelId}`);
        return;
      }

      const boostCount = guild.premiumSubscriptionCount ?? 0;
      const tier = guild.premiumTier ?? 0;
      const tierLabel = BOOST_TIERS[tier] ?? `Tier ${tier}`;

      const embed = new EmbedBuilder()
        .setColor(0xFF73FA) // Discord boost pink
        .setTitle('🚀 Server Boosted!')
        .setDescription(
          `${user} just boosted the server! Thank you so much! 💖`
        )
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: '💎 Booster', value: `${user.tag} (${user.id})`, inline: true },
          { name: '🔢 Total Boosts', value: boostCount.toString(), inline: true },
          { name: '🏆 Current Tier', value: tierLabel, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: guild.name });

      await channel.send({
        content: `${user} 🚀`,
        embeds: [embed],
      });

      logger.info(
        `[BOOST] ${user.tag} boosted ${guild.name} — total boosts: ${boostCount}, tier: ${tierLabel}`
      );
    } catch (error) {
      logger.error('[BOOST] Error in boostMessage event:', error);
    }
  },
};
