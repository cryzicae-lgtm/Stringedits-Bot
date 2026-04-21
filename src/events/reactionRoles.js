/**
 * Reaction Roles — MessageReactionAdd listener
 *
 * Listens for emoji reactions on messages and assigns/removes roles
 * based on the reaction role mappings stored in the database.
 *
 * The remove counterpart is handled in reactionRolesRemove.js.
 * Core logic lives in src/handlers/reactionRoles.js.
 *
 * Reaction role mappings are stored per guild as:
 *   { guildId, channelId, messageId, roles: { emojiId: roleId } }
 */
import { Events } from 'discord.js';
import { getReactionRoleMessage, removeReactionRole } from '../services/reactionRoleService.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.MessageReactionAdd,
  once: false,

  async execute(reaction, user, client) {
    try {
      if (user.bot || !reaction.message.guild) return;

      // Fetch partial reaction/message if needed
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
        // Role no longer exists — clean up the mapping
        await removeReactionRole(client, guild.id, message.id, emoji).catch(() => {});
        return;
      }

      await member.roles.add(role);

      await logEvent({
        client,
        guildId: guild.id,
        eventType: EVENT_TYPES.REACTION_ROLE_ADD,
        data: {
          description: `Reaction role assigned to ${user.tag}`,
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
        `[REACTION_ROLES] Assigned role ${role.name} to ${user.tag} via reaction in ${guild.name}`
      );
    } catch (error) {
      logger.error('[REACTION_ROLES] Error in MessageReactionAdd handler:', error);
    }
  },
};
