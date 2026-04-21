/**
 * Reaction Roles — MessageReactionRemove listener
 *
 * Removes a role from a member when they un-react from a reaction role message.
 * Pairs with reactionRoles.js which handles the add side.
 */
import { Events } from 'discord.js';
import { getReactionRoleMessage, removeReactionRole } from '../services/reactionRoleService.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.MessageReactionRemove,
  once: false,

  async execute(reaction, user, client) {
    try {
      if (user.bot || !reaction.message.guild) return;

      // Fetch partials if needed
      if (reaction.partial) {
        try {
          await reaction.fetch();
        } catch (err) {
          logger.warn('[REACTION_ROLES] Failed to fetch partial reaction:', err.message);
          return;
        }
      }
      if (reaction.message.partial) {
        try {
          await reaction.message.fetch();
        } catch (err) {
          logger.warn('[REACTION_ROLES] Failed to fetch partial message:', err.message);
          return;
        }
      }

      const { message } = reaction;
      const { guild } = message;
      const emoji = reaction.emoji.id ?? reaction.emoji.name;

      const reactionRoleMessage = await getReactionRoleMessage(client, guild.id, message.id);
      if (!reactionRoleMessage) return;

      const roleId = reactionRoleMessage.roles?.[emoji];
      if (!roleId) return;

      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) return;

      const role = guild.roles.cache.get(roleId);
      if (!role) {
        await removeReactionRole(client, guild.id, message.id, emoji).catch(() => {});
        return;
      }

      await member.roles.remove(role);

      await logEvent({
        client,
        guildId: guild.id,
        eventType: EVENT_TYPES.REACTION_ROLE_REMOVE,
        data: {
          description: `Reaction role removed from ${user.tag}`,
          userId: user.id,
          channelId: message.channel.id,
          fields: [
            { name: '👤 Member', value: `${user.tag} (${user.id})`, inline: true },
            { name: '🏷️ Role', value: role.toString(), inline: true },
            { name: '😊 Reaction', value: reaction.emoji.toString(), inline: true },
          ],
        },
      }).catch(() => {});

      logger.info(
        `[REACTION_ROLES] Removed role ${role.name} from ${user.tag} via reaction in ${guild.name}`
      );
    } catch (error) {
      logger.error('[REACTION_ROLES] Error in MessageReactionRemove handler:', error);
    }
  },
};
