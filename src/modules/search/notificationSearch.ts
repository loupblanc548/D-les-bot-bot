import prisma from "../../prisma.js";
import logger from "../../utils/logger.js";

interface SearchFilters {
  query?: string;
  sourceId?: string;
  platform?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

interface SearchResult {
  notifications: any[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
}

export async function searchNotifications(filters: SearchFilters): Promise<SearchResult> {
  try {
    const {
      query,
      sourceId,
      platform,
      startDate,
      endDate,
      page = 1,
      limit = 25,
    } = filters;

    const where: any = {};

    if (query) {
      where.OR = [
        { content: { contains: query, mode: "insensitive" } },
        { url: { contains: query, mode: "insensitive" } },
      ];
    }

    if (sourceId) {
      where.sourceId = sourceId;
    }

    if (platform) {
      where.platform = platform;
    }

    if (startDate || endDate) {
      where.sentAt = {};
      if (startDate) {
        where.sentAt.gte = startDate;
      }
      if (endDate) {
        where.sentAt.lte = endDate;
      }
    }

    const totalCount = await prisma.notification.count({ where });

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { sentAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    });

    const totalPages = Math.ceil(totalCount / limit);

    return {
      notifications,
      totalCount,
      currentPage: page,
      totalPages,
    };
  } catch (error) {
    logger.error("[Search] Error searching notifications:", error);
    return {
      notifications: [],
      totalCount: 0,
      currentPage: filters.page || 1,
      totalPages: 0,
    };
  }
}

export async function searchBySource(sourceId: string, page: number = 1): Promise<SearchResult> {
  return searchNotifications({ sourceId, page });
}

export async function searchByPlatform(platform: string, page: number = 1): Promise<SearchResult> {
  return searchNotifications({ platform, page });
}

export async function searchByDateRange(
  startDate: Date,
  endDate: Date,
  page: number = 1
): Promise<SearchResult> {
  return searchNotifications({ startDate, endDate, page });
}

export async function searchByQuery(query: string, page: number = 1): Promise<SearchResult> {
  return searchNotifications({ query, page });
}
