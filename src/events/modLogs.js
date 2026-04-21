/**
 * Mod Logs — GuildBanAdd listener
 *
 * Logs ban events to the configured mod-log channel.
 * Kick and timeout events are handled in guildMemberRemove.js and
 * guildMemberUpdate.js respectively, which already fire for those actions.
 *
 * Warn events are logged directly by the /warn command via loggingService.
 */
import { Events, AuditLogEvent, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { botConfig } from '../config/bot.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';

/**
 * Sends a formatted embed to the configured mod-log channel.
 */
export async function sendModLog(client, guildId, embed) {
  try {
    const modLogChannelId = botConfig?.logging?.modLogChannel;
    if (!modLogChannelId) return;

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const channel = guild.channels.cache.get(modLogChannelId);
    if (!channel?.isTextBased?.()) return;

    const me = guild.members.me;
    const perms = me ? channel.permissionsFor(me) : null;
    if (
      !perms?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
      ])
    ) {
      logger.warn(`[MOD_LOGS] Missing permissions in mod-log channel ${modLogChannelId}`);
      return;
    }

    await channel.send({ embeds: [embed] });
  } catch (error) {
    logger.error('[MOD_LOGS] Failed to send mod log embed:', error);
  }
}

/**
 * Attempts to fetch the most recent audit log entry for a given action type
 * targeting a specific user/entity ID.
 */
export async function fetchAuditEntry(guild, actionType, targetId) {
  try {
    const me = guild.members.me;
    if (!me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) return null;

    const logs = await guild.fetchAuditLogs({ type: actionType, limit: 5 });
    const entry = logs.entries.find(e => !targetId || e.target?.id === targetId);
    return entry ?? null;
  } catch {
    return null;
  }
}

// ─── GuildBanAdd ──────────────────────────────────────────────────────────────

export default {
  name: Events.GuildBanAdd,
  once: false,

  async execute(ban, client) {
    try {
      const { guild, user } = ban;

      const entry = await fetchAuditEntry(guild, AuditLogEvent.MemberBanAdd, user.id);
      const moderator = entry?.executor ?? null;
      const reason = entry?.reason ?? 'No reason provided';

      const embed = new EmbedBuilder()
        .setColor(0x721919)
        .setTitle('🔨 Member Banned')
        .addFields(
          { name: '👤 User', value: `${user.tag} (${user.id})`, inline: true },
          {
            name: '🛡️ Moderator',
            value: moderator ? `${moderator.tag} (${moderator.id})` : 'Unknown',
            inline: true,
          },
          { name: '📝 Reason', value: reason, inline: false }
        )
        .setThumbnail(user.displayAvatarURL())
        .setTimestamp()
        .setFooter({ text: `Guild: ${guild.name}` });

      await sendModLog(client, guild.id, embed);

      await logEvent({
        client,
        guildId: guild.id,
        eventType: EVENT_TYPES.MODERATION_BAN,
        data: {
          description: `${user.tag} was banned`,
          userId: user.id,
          fields: [
            { name: '👤 User', value: `${user.tag} (${user.id})`, inline: true },
            {
              name: '🛡️ Moderator',
              value: moderator ? `${moderator.tag} (${moderator.id})` : 'Unknown',
              inline: true,
            },
            { name: '📝 Reason', value: reason, inline: false },
          ],
        },
      }).catch(() => {});
    } catch (error) {
      logger.error('[MOD_LOGS] Error in GuildBanAdd handler:', error);
    }
  },
};
