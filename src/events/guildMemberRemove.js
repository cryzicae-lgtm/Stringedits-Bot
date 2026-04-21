import { Events, EmbedBuilder, PermissionFlagsBits, AuditLogEvent } from 'discord.js';
import { getColor } from '../config/bot.js';
import { getWelcomeConfig, getUserApplications, deleteApplication } from '../utils/database.js';
import { formatWelcomeMessage } from '../utils/welcome.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { getServerCounters, updateCounter } from '../services/serverstatsService.js';
import { getGuildBirthdays, deleteBirthday } from '../utils/database.js';
import { deleteUserLevelData } from '../services/leveling.js';
import { logger } from '../utils/logger.js';
import { sendModLog, fetchAuditEntry } from './modLogs.js';

export default {
  name: Events.GuildMemberRemove,
  once: false,
  
  async execute(member) {
    try {
        const { guild, user } = member;

        // ── Kick detection via audit log ──────────────────────────────────────
        try {
            const kickEntry = await fetchAuditEntry(guild, AuditLogEvent.MemberKick, user.id);
            if (kickEntry && Date.now() - kickEntry.createdTimestamp < 5000) {
                const moderator = kickEntry.executor ?? null;
                const reason = kickEntry.reason ?? 'No reason provided';

                const kickEmbed = new EmbedBuilder()
                    .setColor(0xFFA500)
                    .setTitle('👢 Member Kicked')
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

                await sendModLog(member.client, guild.id, kickEmbed);

                await logEvent({
                    client: member.client,
                    guildId: guild.id,
                    eventType: EVENT_TYPES.MODERATION_KICK,
                    data: {
                        description: `${user.tag} was kicked`,
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
            }
        } catch (kickError) {
            logger.debug('[MOD_LOGS] Error checking kick audit log:', kickError);
        }
        // ─────────────────────────────────────────────────────────────────────

        const welcomeConfig = await getWelcomeConfig(member.client, guild.id);
        
        const goodbyeChannelId = welcomeConfig?.goodbyeChannelId;

        if (welcomeConfig?.goodbyeEnabled && goodbyeChannelId) {
            const channel = guild.channels.cache.get(goodbyeChannelId);
            if (channel?.isTextBased?.()) {
                const me = guild.members.me;
                const permissions = me ? channel.permissionsFor(me) : null;
                if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
                    return;
                }

                const formatData = { user, guild, member };
                const goodbyeMessage = formatWelcomeMessage(
                    welcomeConfig.leaveMessage || welcomeConfig.leaveEmbed?.description || '{user.tag} has left the server.',
                    formatData
                );

                const embedTitle = formatWelcomeMessage(
                    welcomeConfig.leaveEmbed?.title || '👋 Goodbye',
                    formatData
                );
                const embedFooter = welcomeConfig.leaveEmbed?.footer
                    ? formatWelcomeMessage(welcomeConfig.leaveEmbed.footer, formatData)
                    : `Goodbye from ${guild.name}!`;

                const canEmbed = permissions.has(PermissionFlagsBits.EmbedLinks);

                if (!canEmbed) {
                    await channel.send({
                        content: welcomeConfig?.goodbyePing ? `<@${user.id}> ${goodbyeMessage}` : goodbyeMessage,
                        allowedMentions: welcomeConfig?.goodbyePing ? { users: [user.id] } : { parse: [] }
                    });
                } else {
                    const embed = new EmbedBuilder()
                        .setTitle(embedTitle)
                        .setDescription(goodbyeMessage)
                        .setColor(welcomeConfig.leaveEmbed?.color || getColor('error'))
                        .setThumbnail(user.displayAvatarURL())
                        .addFields(
                            { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
                            { name: 'Member Count', value: guild.memberCount.toString(), inline: true }
                        )
                        .setTimestamp()
                        .setFooter({ text: embedFooter });

                    if (typeof welcomeConfig.leaveEmbed?.image === 'string') {
                        embed.setImage(welcomeConfig.leaveEmbed.image);
                    } else if (welcomeConfig.leaveEmbed?.image?.url) {
                        embed.setImage(welcomeConfig.leaveEmbed.image.url);
                    }

                    await channel.send({
                        content: welcomeConfig?.goodbyePing ? `<@${user.id}>` : undefined,
                        allowedMentions: welcomeConfig?.goodbyePing ? { users: [user.id] } : { parse: [] },
                        embeds: [embed]
                    });
                }
            }
        }
        
        
        try {
            await logEvent({
                client: member.client,
                guildId: guild.id,
                eventType: EVENT_TYPES.MEMBER_LEAVE,
                data: {
                    description: `${user.tag} left the server`,
                    userId: user.id,
                    fields: [
                        {
                            name: '👤 Member',
                            value: `${user.tag} (${user.id})`,
                            inline: true
                        },
                        {
                            name: '👥 Member Count',
                            value: guild.memberCount.toString(),
                            inline: true
                        },
                        {
                            name: '📅 Joined',
                            value: `<t:${Math.floor((member.joinedTimestamp || 0) / 1000)}:R>`,
                            inline: true
                        }
                    ]
                }
            });
        } catch (error) {
            logger.debug('Error logging member leave:', error);
        }
        
        
        try {
            const counters = await getServerCounters(member.client, guild.id);
            for (const counter of counters) {
                if (counter && counter.type && counter.channelId && counter.enabled !== false) {
                    await updateCounter(member.client, guild, counter);
                }
            }
        } catch (error) {
            logger.debug('Error updating counters on member leave:', error);
        }
        
        // Backup and remove birthday data when a member leaves
        try {
            const birthdays = await getGuildBirthdays(member.client, guild.id);
            if (birthdays[user.id]) {
                const backupKey = `guild:${guild.id}:birthdays:left`;
                const backup = (await member.client.db.get(backupKey)) || {};
                backup[user.id] = birthdays[user.id];
                await member.client.db.set(backupKey, backup);
                await deleteBirthday(member.client, guild.id, user.id);
                logger.debug(`Birthday backed up and removed for user ${user.id} in guild ${guild.id}`);
            }
        } catch (error) {
            logger.debug('Error handling birthday on member leave:', error);
        }
        
        // Remove all pending applications when a member leaves
        try {
            const userApplications = await getUserApplications(member.client, guild.id, user.id);
            if (userApplications && userApplications.length > 0) {
                for (const app of userApplications) {
                    await deleteApplication(member.client, guild.id, app.id, user.id);
                }
                logger.debug(`Removed ${userApplications.length} applications for user ${user.id} in guild ${guild.id}`);
            }
        } catch (error) {
            logger.debug('Error handling applications on member leave:', error);
        }

        // Remove leveling data when a member leaves
        try {
            await deleteUserLevelData(member.client, guild.id, user.id);
            logger.debug(`Removed leveling data for user ${user.id} in guild ${guild.id}`);
        } catch (error) {
            logger.debug('Error handling leveling data on member leave:', error);
        }
        
    } catch (error) {
        logger.error('Error in guildMemberRemove event:', error);
    }
  }
};



