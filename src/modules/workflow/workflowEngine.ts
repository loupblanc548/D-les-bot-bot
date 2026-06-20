import { Client, TextChannel } from "discord.js";
import prisma from "../../prisma.js";
import logger from "../../utils/logger.js";

interface WorkflowContext {
  eventType: string;
  data: any;
  guildId: string;
}

export class WorkflowEngine {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  async evaluateTriggers(context: WorkflowContext): Promise<void> {
    try {
      const workflows = await prisma.workflow.findMany({
        where: {
          guildId: context.guildId,
          enabled: true,
        },
        include: {
          triggers: true,
          actions: true,
        },
      });

      for (const workflow of workflows) {
        const shouldTrigger = await this.evaluateWorkflowTriggers(workflow.triggers, context);
        if (shouldTrigger) {
          await this.executeWorkflowActions(workflow.actions, context);
          logger.info(`[Workflow] Executed workflow: ${workflow.name}`);
        }
      }
    } catch (error) {
      logger.error("[Workflow] Error evaluating triggers:", error);
    }
  }

  private async evaluateWorkflowTriggers(triggers: any[], context: WorkflowContext): Promise<boolean> {
    if (triggers.length === 0) return false;

    for (const trigger of triggers) {
      const config = JSON.parse(trigger.config);
      const result = await this.evaluateSingleTrigger(trigger.type, config, context);
      if (!result) return false;
    }

    return true;
  }

  private async evaluateSingleTrigger(type: string, config: any, context: WorkflowContext): Promise<boolean> {
    switch (type) {
      case "notification_posted":
        return context.eventType === "notification_posted";
      
      case "source_inactive":
        if (context.eventType !== "source_inactive") return false;
        return config.sourceId === context.data.sourceId;
      
      case "keyword_match": {
        if (!context.data.content) return false;
        const keywords = config.keywords || [];
        const content = context.data.content.toLowerCase();
        return keywords.some((keyword: string) => content.includes(keyword.toLowerCase()));
      }
      
      case "time_based": {
        const now = new Date();
        const hour = now.getHours();
        const day = now.getDay();
        
        if (config.hours && !config.hours.includes(hour)) return false;
        if (config.days && !config.days.includes(day)) return false;
        return true;
      }
      
      default:
        logger.warn(`[Workflow] Unknown trigger type: ${type}`);
        return false;
    }
  }

  private async executeWorkflowActions(actions: any[], context: WorkflowContext): Promise<void> {
    const sortedActions = actions.sort((a, b) => a.order - b.order);

    for (const action of sortedActions) {
      try {
        const config = JSON.parse(action.config);
        await this.executeSingleAction(action.type, config, context);
      } catch (error) {
        logger.error(`[Workflow] Error executing action ${action.type}:`, error);
      }
    }
  }

  private async executeSingleAction(type: string, config: any, context: WorkflowContext): Promise<void> {
    switch (type) {
      case "send_message": {
        await this.actionSendMessage(config, context);
        break;
      }
      
      case "add_role": {
        await this.actionAddRole(config, context);
        break;
      }
      
      case "send_dm": {
        await this.actionSendDM(config, context);
        break;
      }
      
      case "log_event": {
        await this.actionLogEvent(config, context);
        break;
      }
      
      default:
        logger.warn(`[Workflow] Unknown action type: ${type}`);
    }
  }

  private async actionSendMessage(config: any, context: WorkflowContext): Promise<void> {
    const channel = await this.client.channels.fetch(config.channelId);
    if (!channel || !(channel instanceof TextChannel)) {
      logger.error(`[Workflow] Invalid channel for send_message: ${config.channelId}`);
      return;
    }

    const message = this.replaceVariables(config.message, context);
    await channel.send({ content: message });
  }

  private async actionAddRole(config: any, context: WorkflowContext): Promise<void> {
    if (!context.data.userId) {
      logger.warn("[Workflow] No userId provided for add_role action");
      return;
    }

    const guild = await this.client.guilds.fetch(context.guildId);
    const member = await guild.members.fetch(context.data.userId);
    const role = await guild.roles.fetch(config.roleId);

    if (role) {
      await member.roles.add(role);
      logger.info(`[Workflow] Added role ${role.name} to ${member.user.tag}`);
    }
  }

  private async actionSendDM(config: any, context: WorkflowContext): Promise<void> {
    if (!context.data.userId) {
      logger.warn("[Workflow] No userId provided for send_dm action");
      return;
    }

    const user = await this.client.users.fetch(context.data.userId);
    const message = this.replaceVariables(config.message, context);
    await user.send({ content: message });
  }

  private async actionLogEvent(config: any, context: WorkflowContext): Promise<void> {
    const logChannelId = process.env.LOG_CHANNEL_ID;
    if (!logChannelId) return;

    const channel = await this.client.channels.fetch(logChannelId);
    if (!channel || !(channel instanceof TextChannel)) return;

    const message = this.replaceVariables(config.message, context);
    await channel.send({ content: `🔧 [Workflow] ${message}` });
  }

  private replaceVariables(template: string, context: WorkflowContext): string {
    let result = template;
    
    if (context.data.userId) {
      result = result.replace(/\{userId\}/g, context.data.userId);
    }
    if (context.data.content) {
      result = result.replace(/\{content\}/g, context.data.content);
    }
    if (context.data.sourceId) {
      result = result.replace(/\{sourceId\}/g, context.data.sourceId);
    }
    
    return result;
  }
}

export async function triggerWorkflowEvent(client: Client, eventType: string, data: any, guildId: string): Promise<void> {
  const engine = new WorkflowEngine(client);
  await engine.evaluateTriggers({ eventType, data, guildId });
}
