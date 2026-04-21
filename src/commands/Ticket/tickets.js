/**
 * Tickets — /tickets command (user-facing)
 *
 * Provides users with a self-service interface to:
 *   - Create a new support ticket
 *   - View their open tickets
 *   - Get information about the ticket system
 *
 * Staff/admin ticket management is handled by:
 *   - /ticket setup   — configure the ticket panel
 *   - /ticket dashboard — manage the ticket system
 *   - /close          — close a ticket
 *   - /claim          — claim a ticket
 *   - /priority       — set ticket priority
 */
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ChannelType,
} from 'discord.js';
import { getColor } from '../../config/bot.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getGuildConfig } from '../../services/guildConfig.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

export default {
  data: new SlashCommandBuilder()
    .setName('tickets')
    .setDescription('Manage your support tickets')
    .setDMPermission(false)
    .addSubcommand(sub =>
      sub
        .setName('create')
        .setDescription('Create a new support ticket')
        .addStringOption(opt =>
          opt
            .setName('reason')
            .setDescription('Brief description of your issue')
            .setRequired(true)
            .setMaxLength(200)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('View your open tickets in this server')
    )
    .addSubcommand(sub =>
      sub
        .setName('info')
        .setDescription('Get information about the ticket system')
    ),

  category: 'ticket',

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'create') {
        await handleCreate(interaction);
      } else if (subcommand === 'list') {
        await handleList(interaction);
      } else if (subcommand === 'info') {
        await handleInfo(interaction);
      }
    } catch (error) {
      logger.error('[TICKETS] Error executing tickets command:', error);
      await handleInteractionError(interaction, error, {
        commandName: 'tickets',
        subcommand,
      });
    }
  },
};

// ─── Create subcommand ────────────────────────────────────────────────────────

async function handleCreate(interaction) {
  const deferred = await InteractionHelper.safeDefer(interaction, {
    flags: MessageFlags.Ephemeral,
  });
  if (!deferred) return;

  const { guild, member, user } = interaction;
  const reason = interaction.options.getString('reason');
  const client = interaction.client;

  // Load guild config to check if ticket system is set up
  const config = await getGuildConfig(client, guild.id);

  if (!config?.ticketPanelChannelId) {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [
        errorEmbed(
          'Ticket System Not Set Up',
          'The ticket system has not been configured for this server yet.\n\n' +
            'Please ask a server administrator to run `/ticket setup` first.'
        ),
      ],
    });
  }

  // Check open ticket count for this user
  let openCount = 0;
  try {
    const { getOpenTicketCountForUser } = await import('../../utils/database.js');
    openCount = (await getOpenTicketCountForUser(guild.id, user.id)) ?? 0;
  } catch {
    openCount = 0;
  }

  const maxTickets = config.maxTicketsPerUser ?? 3;
  if (openCount >= maxTickets) {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [
        errorEmbed(
          'Too Many Open Tickets',
          `You already have **${openCount}** open ticket${openCount !== 1 ? 's' : ''}. ` +
            `The maximum is **${maxTickets}**.\n\nPlease wait for your existing tickets to be resolved before opening a new one.`
        ),
      ],
    });
  }

  // Create the ticket channel
  try {
    const { createTicket } = await import('../../services/ticket.js');
    const result = await createTicket(guild, member, config.ticketCategoryId, reason);

    if (!result?.success || !result?.channel) {
      return InteractionHelper.safeEditReply(interaction, {
        embeds: [
          errorEmbed(
            'Ticket Creation Failed',
            result?.error ??
              'Could not create your ticket channel. Please try again or contact a staff member.'
          ),
        ],
      });
    }

    const ticketChannel = result.channel;

    const embed = new EmbedBuilder()
      .setColor(getColor('success'))
      .setTitle('🎫 Ticket Created!')
      .setDescription(
        `Your ticket has been created: ${ticketChannel}\n\n` +
          `A staff member will be with you shortly. Please describe your issue in the ticket channel.`
      )
      .addFields(
        { name: '📝 Reason', value: reason, inline: false },
        { name: '🎫 Channel', value: ticketChannel.toString(), inline: true },
        {
          name: '📅 Created',
          value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
          inline: true,
        }
      )
      .setTimestamp();

    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });

    logger.info(
      `[TICKETS] Ticket created by ${user.tag} in ${guild.name}: #${ticketChannel.name}`
    );
  } catch (error) {
    logger.error('[TICKETS] Error creating ticket:', error);
    await InteractionHelper.safeEditReply(interaction, {
      embeds: [
        errorEmbed(
          'Ticket Creation Failed',
          'An error occurred while creating your ticket. Please try again or contact a staff member directly.'
        ),
      ],
    });
  }
}

// ─── List subcommand ──────────────────────────────────────────────────────────

async function handleList(interaction) {
  const deferred = await InteractionHelper.safeDefer(interaction, {
    flags: MessageFlags.Ephemeral,
  });
  if (!deferred) return;

  const { guild, user, client } = interaction;

  // Find all ticket channels this user has access to
  const ticketChannels = guild.channels.cache.filter(ch => {
    if (ch.type !== ChannelType.GuildText) return false;
    // Ticket channels typically follow the pattern "ticket-username" or "ticket-XXXX"
    if (!ch.name.startsWith('ticket-')) return false;
    // Check if the user has view permissions in this channel
    return ch.permissionsFor(user.id)?.has(PermissionFlagsBits.ViewChannel) ?? false;
  });

  if (!ticketChannels.size) {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [
        infoEmbed(
          'No Open Tickets',
          "You don't have any open tickets in this server.\n\nUse `/tickets create` to open a new ticket."
        ),
      ],
    });
  }

  const embed = new EmbedBuilder()
    .setColor(getColor('primary'))
    .setTitle(`🎫 Your Tickets (${ticketChannels.size})`)
    .setDescription(
      ticketChannels
        .first(10)
        .map(ch => `• ${ch} — \`#${ch.name}\``)
        .join('\n')
    )
    .setTimestamp()
    .setFooter({ text: `Showing up to 10 tickets` });

  await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
}

// ─── Info subcommand ──────────────────────────────────────────────────────────

async function handleInfo(interaction) {
  const deferred = await InteractionHelper.safeDefer(interaction, {
    flags: MessageFlags.Ephemeral,
  });
  if (!deferred) return;

  const { guild, client } = interaction;
  const config = await getGuildConfig(client, guild.id);

  if (!config?.ticketPanelChannelId) {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [
        infoEmbed(
          'Ticket System — Not Configured',
          'The ticket system has not been set up for this server yet.\n\n' +
            'Ask a server administrator to run `/ticket setup` to enable it.'
        ),
      ],
    });
  }

  const panelChannel = guild.channels.cache.get(config.ticketPanelChannelId);
  const category = config.ticketCategoryId
    ? guild.channels.cache.get(config.ticketCategoryId)
    : null;
  const staffRole = config.ticketStaffRoleId
    ? guild.roles.cache.get(config.ticketStaffRoleId)
    : null;

  const embed = new EmbedBuilder()
    .setColor(getColor('info'))
    .setTitle('🎫 Ticket System — Information')
    .addFields(
      {
        name: '📺 Panel Channel',
        value: panelChannel ? panelChannel.toString() : '*(not found)*',
        inline: true,
      },
      {
        name: '📁 Ticket Category',
        value: category ? category.name : 'Auto-created',
        inline: true,
      },
      {
        name: '🛡️ Staff Role',
        value: staffRole ? staffRole.toString() : 'Not set',
        inline: true,
      },
      {
        name: '🔢 Max Tickets Per User',
        value: (config.maxTicketsPerUser ?? 3).toString(),
        inline: true,
      },
      {
        name: '📬 DM on Close',
        value: config.dmOnClose !== false ? 'Enabled' : 'Disabled',
        inline: true,
      }
    )
    .setTimestamp()
    .setFooter({ text: 'Use /tickets create to open a new ticket' });

  await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
}
