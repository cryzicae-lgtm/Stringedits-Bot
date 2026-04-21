/**
 * Ticket Handler — ticketCreate / ticketClose lifecycle event listener
 *
 * Listens for custom `ticketCreate` and `ticketClose` events emitted by the
 * ticket service (src/services/ticket.js) to perform post-creation and
 * post-close actions such as notifying staff, sending DMs, and logging.
 *
 * Custom events are emitted via client.emit() from the ticket service.
 *
 * Primary ticket logic lives in:
 *   - src/commands/Ticket/ticket.js       (setup command)
 *   - src/commands/Ticket/close.js        (close command)
 *   - src/commands/Ticket/claim.js        (claim command)
 *   - src/handlers/ticketButtons.js       (button interactions)
 *   - src/services/ticket.js              (core service)
 *   - src/events/channelDelete.js         (orphan cleanup)
 */
import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getColor } from '../config/bot.js';
import { logger } from '../utils/logger.js';

/**
 * Sends a DM to a user notifying them their ticket was closed.
 * Silently fails if the user has DMs disabled.
 */
export async function sendTicketCloseDM(user, guild, ticketData) {
  try {
    const embed = new EmbedBuilder()
      .setColor(getColor('error'))
      .setTitle('🔒 Your Ticket Has Been Closed')
      .setDescription(
        `Your support ticket in **${guild.name}** has been closed.`
      )
      .addFields(
        {
          name: '🎫 Ticket',
          value: ticketData.channelName ?? 'Unknown',
          inline: true,
        },
        {
          name: '📅 Closed At',
          value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
          inline: true,
        },
        {
          name: '📝 Reason',
          value: ticketData.closeReason ?? 'No reason provided',
          inline: false,
        }
      )
      .setTimestamp()
      .setFooter({ text: guild.name });

    await user.send({ embeds: [embed] });
    logger.info(`[TICKET_HANDLER] Sent close DM to ${user.tag}`);
  } catch {
    // User has DMs disabled — silently ignore
    logger.debug(`[TICKET_HANDLER] Could not DM ${user.tag} (DMs likely disabled)`);
  }
}

/**
 * Notifies the staff role when a new ticket is created.
 */
export async function notifyStaffOnCreate(guild, ticketChannel, creator, staffRoleId) {
  try {
    if (!staffRoleId) return;

    const role = guild.roles.cache.get(staffRoleId);
    if (!role) return;

    const me = guild.members.me;
    const perms = me ? ticketChannel.permissionsFor(me) : null;
    if (!perms?.has([PermissionFlagsBits.SendMessages])) return;

    await ticketChannel.send({
      content: `${role} — a new ticket has been opened by ${creator}. Please respond when available.`,
      allowedMentions: { roles: [staffRoleId] },
    });
  } catch (error) {
    logger.warn('[TICKET_HANDLER] Failed to notify staff on ticket create:', error);
  }
}

// ─── Custom event listener ────────────────────────────────────────────────────
// This file exports a default event handler for the custom `ticketCreate` event.
// The ticket service can emit this event to trigger post-creation hooks.

export default {
  name: 'ticketCreate',
  once: false,

  async execute({ guild, channel, creator, staffRoleId }, client) {
    try {
      if (!guild || !channel || !creator) return;

      logger.info(
        `[TICKET_HANDLER] Ticket created: #${channel.name} by ${creator.user?.tag ?? creator.id} in ${guild.name}`
      );

      // Notify staff role in the ticket channel
      await notifyStaffOnCreate(guild, channel, creator, staffRoleId);
    } catch (error) {
      logger.error('[TICKET_HANDLER] Error in ticketCreate handler:', error);
    }
  },
};
