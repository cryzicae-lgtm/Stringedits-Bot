/**
 * Rate Edits — /rateedits command
 *
 * Allows moderators to configure the rate-edits channel where message edits
 * are tracked and community members can rate/react to them.
 *
 * When a message is edited in a designated rate-edits channel, the bot
 * automatically posts a comparison embed showing the before/after content
 * with reaction buttons so members can rate the edit.
 *
 * The rate-edits channel IDs are configured in botConfig.specialized.rateEditsChannel.
 */
import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { botConfig, getColor } from '../../config/bot.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';

// Reaction emojis used for rating edits
const RATING_EMOJIS = ['⬆️', '⬇️', '🔥', '💀'];

export default {
  data: new SlashCommandBuilder()
    .setName('rateedits')
    .setDescription('Manage the rate-edits channel and view edit history')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(sub =>
      sub
        .setName('info')
        .setDescription('Show the current rate-edits channel configuration')
    )
    .addSubcommand(sub =>
      sub
        .setName('history')
        .setDescription('View recent tracked edits in this server')
        .addIntegerOption(opt =>
          opt
            .setName('limit')
            .setDescription('Number of recent edits to show (default: 5, max: 10)')
            .setMinValue(1)
            .setMaxValue(10)
            .setRequired(false)
        )
    ),

  category: 'moderation',

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    const deferred = await InteractionHelper.safeDefer(interaction, {
      flags: MessageFlags.Ephemeral,
    });
    if (!deferred) return;

    try {
      if (subcommand === 'info') {
        await handleInfo(interaction);
      } else if (subcommand === 'history') {
        await handleHistory(interaction);
      }
    } catch (error) {
      logger.error('[RATE_EDITS] Error executing rateedits command:', error);
      await InteractionHelper.safeEditReply(interaction, {
        embeds: [errorEmbed('Error', 'An unexpected error occurred.')],
      });
    }
  },
};

// ─── Info subcommand ──────────────────────────────────────────────────────────

async function handleInfo(interaction) {
  const rateEditsChannels = botConfig?.specialized?.rateEditsChannel ?? [];

  if (!rateEditsChannels.length) {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [
        infoEmbed(
          'Rate Edits — Not Configured',
          'No rate-edits channels are configured.\n\n' +
            'To enable this feature, add channel IDs to `botConfig.specialized.rateEditsChannel` in `src/config/bot.js`.'
        ),
      ],
    });
  }

  const channelMentions = rateEditsChannels
    .map(id => {
      const ch = interaction.guild.channels.cache.get(id);
      return ch ? `${ch} (\`${id}\`)` : `\`${id}\` *(channel not found)*`;
    })
    .join('\n');

  const embed = new EmbedBuilder()
    .setColor(getColor('info'))
    .setTitle('📝 Rate Edits — Configuration')
    .setDescription(
      'The following channels are monitored for message edits. ' +
        'When a message is edited in one of these channels, the bot posts a ' +
        'before/after comparison embed with reaction ratings.'
    )
    .addFields({
      name: `📺 Monitored Channels (${rateEditsChannels.length})`,
      value: channelMentions,
      inline: false,
    })
    .addFields({
      name: '⭐ Rating Reactions',
      value: RATING_EMOJIS.join('  '),
      inline: false,
    })
    .setTimestamp()
    .setFooter({ text: 'Edit src/config/bot.js to change channel IDs' });

  await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
}

// ─── History subcommand ───────────────────────────────────────────────────────

async function handleHistory(interaction) {
  const limit = interaction.options.getInteger('limit') ?? 5;
  const client = interaction.client;
  const guildId = interaction.guildId;

  // Retrieve stored edit history from the database
  let editHistory = [];
  try {
    const historyKey = `guild:${guildId}:rateEdits:history`;
    editHistory = (await client.db?.get(historyKey)) ?? [];
  } catch {
    editHistory = [];
  }

  if (!editHistory.length) {
    return InteractionHelper.safeEditReply(interaction, {
      embeds: [
        infoEmbed(
          'Rate Edits — No History',
          'No edits have been tracked yet in this server.\n\n' +
            'Edits are tracked automatically when messages are edited in the configured rate-edits channels.'
        ),
      ],
    });
  }

  const recent = editHistory.slice(-limit).reverse();

  const embed = new EmbedBuilder()
    .setColor(getColor('primary'))
    .setTitle(`📝 Rate Edits — Last ${recent.length} Tracked Edit${recent.length !== 1 ? 's' : ''}`)
    .setTimestamp();

  for (const entry of recent) {
    const timestamp = entry.timestamp
      ? `<t:${Math.floor(new Date(entry.timestamp).getTime() / 1000)}:R>`
      : 'Unknown';

    embed.addFields({
      name: `✏️ Edit by ${entry.authorTag ?? 'Unknown'} — ${timestamp}`,
      value:
        `**Before:** ${(entry.oldContent ?? '*(empty)*').substring(0, 200)}\n` +
        `**After:** ${(entry.newContent ?? '*(empty)*').substring(0, 200)}`,
      inline: false,
    });
  }

  await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
}

// ─── Exported utility: track an edit ─────────────────────────────────────────

/**
 * Called from the messageUpdate event to record and post a rate-edit embed.
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').Message} oldMessage
 * @param {import('discord.js').Message} newMessage
 */
export async function trackRateEdit(client, oldMessage, newMessage) {
  try {
    const rateEditsChannels = botConfig?.specialized?.rateEditsChannel ?? [];
    if (!rateEditsChannels.includes(newMessage.channel.id)) return;
    if (oldMessage.content === newMessage.content) return;

    const { guild, author, channel } = newMessage;

    // Build the comparison embed
    const embed = new EmbedBuilder()
      .setColor(getColor('info'))
      .setTitle('✏️ Message Edited — Rate This Edit!')
      .setAuthor({
        name: author.tag,
        iconURL: author.displayAvatarURL({ dynamic: true }),
      })
      .addFields(
        {
          name: '📄 Before',
          value: (oldMessage.content || '*(empty)*').substring(0, 1024),
          inline: false,
        },
        {
          name: '📄 After',
          value: (newMessage.content || '*(empty)*').substring(0, 1024),
          inline: false,
        },
        {
          name: '🔗 Jump to Message',
          value: `[Click here](${newMessage.url})`,
          inline: true,
        }
      )
      .setTimestamp()
      .setFooter({ text: `React to rate this edit!` });

    const ratingMessage = await channel.send({ embeds: [embed] });

    // Add rating reactions
    for (const emoji of RATING_EMOJIS) {
      await ratingMessage.react(emoji).catch(() => {});
    }

    // Store in edit history
    try {
      const historyKey = `guild:${guild.id}:rateEdits:history`;
      const history = (await client.db?.get(historyKey)) ?? [];
      history.push({
        messageId: newMessage.id,
        ratingMessageId: ratingMessage.id,
        channelId: channel.id,
        authorId: author.id,
        authorTag: author.tag,
        oldContent: oldMessage.content,
        newContent: newMessage.content,
        timestamp: new Date().toISOString(),
      });

      // Keep only the last 100 entries
      const trimmed = history.slice(-100);
      await client.db?.set(historyKey, trimmed);
    } catch (dbError) {
      logger.warn('[RATE_EDITS] Failed to save edit history:', dbError);
    }

    logger.info(
      `[RATE_EDITS] Tracked edit by ${author.tag} in #${channel.name} (guild: ${guild.id})`
    );
  } catch (error) {
    logger.error('[RATE_EDITS] Error tracking rate edit:', error);
  }
}
