/**
 * Mod Logs — GuildBanRemove listener
 * Logs unban events to the configured mod-log channel.
 */
import { Events, AuditLogEvent, EmbedBuilder } from 'discord.js';
import { sendModLog, fetchAuditEntry } from './modLogs.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.GuildBanRemove,
  once: false,

  async execute(ban, client) {
    try {
      const { guild, user } = ban;

      const entry = await fetchAuditEntry(guild, AuditLogEvent.MemberBanRemove, user.id);
      const moderator = entry?.executor ?? null;

      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Member Unbanned')
        .addFields(
          { name: '👤 User', value: `${user.tag} (${user.id})`, inline: true },
          {
            name: '🛡️ Moderator',
            value: moderator ? `${moderator.tag} (${moderator.id})` : 'Unknown',
            inline: true,
          }
        )
        .setThumbnail(user.displayAvatarURL())
        .setTimestamp()
        .setFooter({ text: `Guild: ${guild.name}` });

      await sendModLog(client, guild.id, embed);
    } catch (error) {
      logger.error('[MOD_LOGS] Error in GuildBanRemove handler:', error);
    }
  },
};
