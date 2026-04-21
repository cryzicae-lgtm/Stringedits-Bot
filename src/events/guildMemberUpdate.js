import { Events, AuditLogEvent, EmbedBuilder } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';
import { sendModLog, fetchAuditEntry } from './modLogs.js';

export default {
  name: Events.GuildMemberUpdate,
  once: false,

  async execute(oldMember, newMember) {
    try {
      if (!newMember.guild) return;
      const { guild } = newMember;

      // ── Timeout (mute/unmute) detection ──────────────────────────────────
      try {
        const wasTimedOut = !!oldMember.communicationDisabledUntilTimestamp;
        const isTimedOut = !!newMember.communicationDisabledUntilTimestamp;

        if (wasTimedOut !== isTimedOut) {
          const entry = await fetchAuditEntry(guild, AuditLogEvent.MemberUpdate, newMember.id);
          const moderator = entry?.executor ?? null;
          const reason = entry?.reason ?? 'No reason provided';

          if (!wasTimedOut && isTimedOut) {
            const until = newMember.communicationDisabledUntilTimestamp;
            const timeoutEmbed = new EmbedBuilder()
              .setColor(0xF1C40F)
              .setTitle('🔇 Member Timed Out')
              .addFields(
                { name: '👤 User', value: `${newMember.user.tag} (${newMember.id})`, inline: true },
                {
                  name: '🛡️ Moderator',
                  value: moderator ? `${moderator.tag} (${moderator.id})` : 'Unknown',
                  inline: true,
                },
                { name: '⏰ Until', value: `<t:${Math.floor(until / 1000)}:F>`, inline: true },
                { name: '📝 Reason', value: reason, inline: false }
              )
              .setThumbnail(newMember.user.displayAvatarURL())
              .setTimestamp()
              .setFooter({ text: `Guild: ${guild.name}` });

            await sendModLog(newMember.client, guild.id, timeoutEmbed);

            await logEvent({
              client: newMember.client,
              guildId: guild.id,
              eventType: EVENT_TYPES.MODERATION_MUTE,
              data: {
                description: `${newMember.user.tag} was timed out`,
                userId: newMember.id,
                fields: [
                  { name: '👤 User', value: `${newMember.user.tag} (${newMember.id})`, inline: true },
                  {
                    name: '🛡️ Moderator',
                    value: moderator ? `${moderator.tag} (${moderator.id})` : 'Unknown',
                    inline: true,
                  },
                  { name: '⏰ Until', value: `<t:${Math.floor(until / 1000)}:F>`, inline: true },
                  { name: '📝 Reason', value: reason, inline: false },
                ],
              },
            }).catch(() => {});
          } else if (wasTimedOut && !isTimedOut) {
            const unmuteEmbed = new EmbedBuilder()
              .setColor(0x57F287)
              .setTitle('🔊 Timeout Removed')
              .addFields(
                { name: '👤 User', value: `${newMember.user.tag} (${newMember.id})`, inline: true },
                {
                  name: '🛡️ Moderator',
                  value: moderator ? `${moderator.tag} (${moderator.id})` : 'Unknown',
                  inline: true,
                }
              )
              .setThumbnail(newMember.user.displayAvatarURL())
              .setTimestamp()
              .setFooter({ text: `Guild: ${guild.name}` });

            await sendModLog(newMember.client, guild.id, unmuteEmbed);
          }
        }
      } catch (timeoutError) {
        logger.debug('[MOD_LOGS] Error checking timeout change:', timeoutError);
      }
      // ─────────────────────────────────────────────────────────────────────

      // ── Boost detection ──────────────────────────────────────────────────
      try {
        const hadBoost = !!oldMember.premiumSinceTimestamp;
        const hasBoost = !!newMember.premiumSinceTimestamp;

        if (!hadBoost && hasBoost) {
          // Member just started boosting — handled in boostMessage.js
          // We emit a custom signal here so boostMessage.js can react
          newMember.client.emit('guildMemberBoost', newMember);
        }
      } catch (boostError) {
        logger.debug('[MOD_LOGS] Error checking boost change:', boostError);
      }
      // ─────────────────────────────────────────────────────────────────────

      const fields = [];

      fields.push({
        name: '👤 Member',
        value: `${newMember.user.tag} (${newMember.user.id})`,
        inline: true
      });

      if (oldMember.nickname !== newMember.nickname) {
        fields.push({
          name: '🏷️ Old Nickname',
          value: oldMember.nickname || '*(no nickname)*',
          inline: true
        });

        fields.push({
          name: '🏷️ New Nickname',
          value: newMember.nickname || '*(no nickname)*',
          inline: true
        });

        await logEvent({
          client: newMember.client,
          guildId: newMember.guild.id,
          eventType: EVENT_TYPES.MEMBER_NAME_CHANGE,
          data: {
            description: `Member nickname changed: ${newMember.user.tag}`,
            userId: newMember.user.id,
            fields
          }
        });

        return;
      }

    } catch (error) {
      logger.error('Error in guildMemberUpdate event:', error);
    }
  }
};
