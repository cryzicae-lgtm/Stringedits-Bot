/**
 * Welcome Message — GuildMemberAdd listener
 *
 * Sends a welcome message when a user joins the server.
 * This handler uses the static botConfig values as a fallback/supplement
 * to the database-driven welcome system in guildMemberAdd.js.
 *
 * It only fires when botConfig.welcome.enabled is true AND
 * botConfig.welcome.channelId is set, providing a config-file-based
 * welcome that works even before the /welcome command is run.
 *
 * Optional role assignment on join is also supported via
 * botConfig.welcome.autoRoleId.
 */
import { Events, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { botConfig, getColor } from '../config/bot.js';
import { logger } from '../utils/logger.js';

/**
 * Replaces template tokens in a welcome message string.
 * Supported tokens: {user}, {user.tag}, {user.id}, {server}, {memberCount}
 */
function formatMessage(template, { user, guild }) {
  return template
    .replace(/\{user\.mention\}|\{user\}/g, user.toString())
    .replace(/\{user\.tag\}/g, user.tag)
    .replace(/\{user\.username\}/g, user.username)
    .replace(/\{user\.id\}/g, user.id)
    .replace(/\{server\}|\{server\.name\}|\{guild\.name\}/g, guild.name)
    .replace(/\{memberCount\}|\{guild\.memberCount\}/g, guild.memberCount.toString());
}

export default {
  name: Events.GuildMemberAdd,
  once: false,

  async execute(member, client) {
    try {
      const { guild, user } = member;

      const welcomeCfg = botConfig?.welcome;
      if (!welcomeCfg?.enabled || !welcomeCfg?.channelId) return;

      const channel = guild.channels.cache.get(welcomeCfg.channelId);
      if (!channel?.isTextBased?.()) return;

      // Permission check
      const me = guild.members.me;
      const perms = me ? channel.permissionsFor(me) : null;
      if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
        logger.warn(`[WELCOME] Missing permissions in welcome channel ${welcomeCfg.channelId}`);
        return;
      }

      const messageTemplate =
        welcomeCfg.message || 'Welcome {user} to **{server}**! 🎉';
      const formattedMessage = formatMessage(messageTemplate, { user, guild });

      if (perms.has(PermissionFlagsBits.EmbedLinks)) {
        const embed = new EmbedBuilder()
          .setColor(getColor('success'))
          .setTitle('🎉 Welcome!')
          .setDescription(formattedMessage)
          .setThumbnail(user.displayAvatarURL({ dynamic: true }))
          .addFields(
            { name: '👤 Member', value: `${user.tag}`, inline: true },
            { name: '👥 Member Count', value: guild.memberCount.toString(), inline: true },
            {
              name: '📅 Account Created',
              value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`,
              inline: true,
            }
          )
          .setTimestamp()
          .setFooter({ text: `Welcome to ${guild.name}!` });

        await channel.send({ embeds: [embed] });
      } else {
        await channel.send({ content: formattedMessage });
      }

      // Optional: assign a role on join if configured
      if (welcomeCfg.autoRoleId) {
        try {
          const role = guild.roles.cache.get(welcomeCfg.autoRoleId);
          if (role) {
            await member.roles.add(role);
            logger.info(
              `[WELCOME] Assigned auto-role ${role.name} to ${user.tag} in ${guild.name}`
            );
          }
        } catch (roleError) {
          logger.warn(`[WELCOME] Failed to assign auto-role to ${user.tag}:`, roleError);
        }
      }

      logger.info(`[WELCOME] Sent welcome message for ${user.tag} in ${guild.name}`);
    } catch (error) {
      logger.error('[WELCOME] Error in welcome event:', error);
    }
  },
};
