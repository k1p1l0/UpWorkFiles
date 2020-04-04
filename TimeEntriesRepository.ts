import { AbstractRepository, EntityRepository, FindConditions, MoreThanOrEqual, EntityManager } from 'typeorm';
import Boom from 'boom';

import { serializableTransactionWithRetry } from '../utils/db';
import TimeEntry from '../entities/TimeEntry';
import Company from '../entities/Company';
import { AggregatedTimeEntry } from '../lambdas/timeEntries/ListAggregatedTimeEntries/types';

const DEFAULT_ITEMS_PER_PAGE = 10;

@EntityRepository(TimeEntry)
export default class TimeEntriesRepository extends AbstractRepository<TimeEntry> {
    async get(id: TimeEntry['id']) {
        const timeEntry = await this.repository.findOne({ id }, {
            relations: ['assistant', 'company'],
        });

        if (!timeEntry) {
            throw Boom.notFound(`Time entry ${id} not found`);
        }

        return timeEntry;
    }

    async sync({
        timeEntries,
        harvestClientId,
        harvestUserId,
        from,
        manager,
    }: {
        timeEntries: TimeEntry[];
        harvestClientId: TimeEntry['harvestClientId'];
        harvestUserId: TimeEntry['harvestUserId'];
        from?: string;
        manager?: EntityManager;
    }): Promise<TimeEntry[]> {
        return serializableTransactionWithRetry(async (manager) => {
            const filter: FindConditions<TimeEntry> = {
                harvestUserId,
                harvestClientId,
            };

            if (from) {
                filter.createdAt = MoreThanOrEqual(from);
            }

            await manager.delete(TimeEntry, filter);

            if (timeEntries.length) {
                await manager.insert(TimeEntry, timeEntries);
            }

            return timeEntries;
        }, {
            manager,
        });
    }

    async list(
        {
            page = 1,
            perPage = DEFAULT_ITEMS_PER_PAGE,
            auth0Id,
            assistantId,
            companyId,
            assistantName,
            companyName,
            from,
            to,
            description,
            sortBy = 'spentDate',
            direction = 'ASC',
        }: {
            page?: number;
            perPage?: number;
            auth0Id?: Company['auth0Id'];
            assistantId?: TimeEntry['assistantId'];
            companyId?: TimeEntry['companyId'];
            assistantName?: string;
            companyName?: string;
            from?: string;
            to?: string;
            description?: string;
            sortBy?: 'spentDate' | 'assistant' | 'company' | 'hoursTracked' | 'description';
            direction?: 'DESC' | 'ASC';
        },
    ): Promise<[TimeEntry[], number]> {
        const queryBuilder = this.repository.createQueryBuilder('timeEntries')
            .select()
            .leftJoinAndSelect('timeEntries.assistant', 'assistant')
            .leftJoinAndSelect('timeEntries.company', 'company')
            .limit(perPage)
            .offset(perPage * (page - 1))
            .where('"assistantId" IS NOT NULL')
            .andWhere('"companyId" IS NOT NULL');

        if (auth0Id) {
            queryBuilder
                .andWhere('"company"."auth0Id" = :auth0Id', { auth0Id });
        }

        if (assistantId) {
            queryBuilder
                .andWhere('"assistant"."id" = :id', { id: assistantId });
        }

        if (companyId) {
            queryBuilder
                .andWhere('"company"."id" = :id', { id: companyId });
        }

        if (assistantName) {
            queryBuilder
                .andWhere('strpos(LOWER("firstName") || \' \' || LOWER("lastName"), :name) > 0', {
                    name: assistantName.trim().split(/\s+/).filter((part) => !!part).join(' ').toLocaleLowerCase(),
                });
        }

        if (companyName) {
            queryBuilder
                .andWhere('"company"."name" LIKE :companyName', { companyName: `%${companyName}%` });
        }

        if (from) {
            queryBuilder
                .andWhere('"spentDate" >= :from', { from });
        }

        if (to) {
            queryBuilder
                .andWhere('"spentDate" <= :to', { to });
        }

        if (description) {
            queryBuilder
                .andWhere('LOWER("taskName") LIKE :description', { description: `%${description.toLowerCase()}%` });
        }

        switch (sortBy) {
            case 'assistant':
                queryBuilder.orderBy({
                    '"firstName"': direction,
                    '"lastName"': direction,
                });
                break;
            case 'company':
                queryBuilder.orderBy({
                    '"name"': direction,
                });
                break;
            case 'description':
                queryBuilder.orderBy({
                    '"taskName"': direction,
                });
                break;
            default:
                queryBuilder.orderBy({
                    [`"${sortBy}"`]: direction,
                });
                break;
        }

        return queryBuilder.getManyAndCount();
    }

    async getTotalHoursTracked({
        auth0Id,
        assistantId,
        companyId,
        assistantName,
        companyName,
        from,
        to,
        description,
    }: {
        auth0Id?: Company['auth0Id'];
        assistantId?: TimeEntry['assistantId'];
        companyId?: TimeEntry['companyId'];
        assistantName?: string;
        companyName?: string;
        from?: string;
        to?: string;
        description?: string;
    }) {
        console.log('TESTING HOURS');
        const queryBuilder = this.repository.createQueryBuilder('timeEntries')
            .select('SUM("hoursTracked")', 'totalHoursTracked')
            .leftJoin('timeEntries.assistant', 'assistant')
            .leftJoin('timeEntries.company', 'company')
            .where('"assistantId" IS NOT NULL')
            .andWhere('"companyId" IS NOT NULL');

        if (auth0Id) {
            queryBuilder
                .andWhere('"company"."auth0Id" = :auth0Id', { auth0Id });
        }

        if (assistantId) {
            queryBuilder
                .andWhere('"assistant"."id" = :id', { id: assistantId });
        }

        if (companyId) {
            queryBuilder
                .andWhere('"company"."id" = :id', { id: companyId });
        }

        if (assistantName) {
            queryBuilder
                .andWhere('strpos(LOWER("firstName") || \' \' || LOWER("lastName"), :name) > 0', {
                    name: assistantName.trim().split(/\s+/).filter((part) => !!part).join(' ').toLocaleLowerCase(),
                });
        }

        if (companyName) {
            queryBuilder
                .andWhere('"company"."name" LIKE :companyName', { companyName: `%${companyName}%` });
        }

        if (from) {
            queryBuilder
                .andWhere('"spentDate" >= :from', { from });
        }

        if (to) {
            queryBuilder
                .andWhere('"spentDate" <= :to', { to });
        }

        if (description) {
            queryBuilder
                .andWhere('LOWER("taskName") LIKE :description', { description: `%${description.toLowerCase()}%` });
        }

        const { totalHoursTracked } = await queryBuilder.getRawOne() as { totalHoursTracked: string };

        return +totalHoursTracked || 0;
    }

    async listAggregated({
        page = 1,
        perPage = DEFAULT_ITEMS_PER_PAGE,
        sortBy = 'assistant',
        direction = 'ASC',
        from,
    }: {
        page?: number;
        perPage?: number;
        sortBy?: 'assistant' | 'company' | 'hoursTracked';
        direction?: 'DESC' | 'ASC';
        from: string;
    }): Promise<[AggregatedTimeEntry[], number]> {
        const dataQueryBuilder = this.repository.createQueryBuilder('timeEntries')
            .select('"assistant"."firstName"')
            .addSelect('"assistant"."lastName"')
            .addSelect('"company"."name"', 'companyName')
            .addSelect('"assistant"."imageUrl"')
            .addSelect('SUM("hoursTracked")', 'hoursTracked')
            .leftJoin('timeEntries.assistant', 'assistant')
            .leftJoin('timeEntries.company', 'company')
            .groupBy('"assistant"."id"')
            .addGroupBy('"company"."id"')
            .limit(perPage)
            .offset(perPage * (page - 1))
            .where('"spentDate" >= :from', { from })
            .andWhere('"assistantId" IS NOT NULL')
            .andWhere('"companyId" IS NOT NULL');

        switch (sortBy) {
            case 'assistant':
                dataQueryBuilder.orderBy({
                    '"firstName"': { order: direction, nulls: 'NULLS LAST' },
                    '"lastName"': { order: direction, nulls: 'NULLS LAST' },
                });
                break;
            case 'company':
                dataQueryBuilder.orderBy({
                    '"companyName"': { order: direction, nulls: 'NULLS LAST' },
                });
                break;
            default:
                dataQueryBuilder.orderBy({
                    [`"${sortBy}"`]: { order: direction, nulls: 'NULLS LAST' },
                });
                break;
        }

        const data = await dataQueryBuilder.getRawMany() as (
            Omit<AggregatedTimeEntry, 'hoursTracked'> & { hoursTracked: string }
        )[];

        const { count } = await this.repository.createQueryBuilder('timeEntries')
            .select('COUNT(DISTINCT("assistantId", "companyId"))', 'count')
            .where('"spentDate" >= :from', { from })
            .andWhere('"assistantId" IS NOT NULL')
            .andWhere('"companyId" IS NOT NULL')
            .getRawOne() as { count: number };

        return [
            data.map((item) => ({
                ...item,
                hoursTracked: +item.hoursTracked || 0,
            })),
            count,
        ];
    }

    async setAssistantId({
        assistantId,
        harvestUserId,
    }: {
        assistantId: TimeEntry['assistantId'];
        harvestUserId: TimeEntry['harvestUserId'];
    }) {
        return this.repository.update({ harvestUserId }, { assistantId });
    }

    async updateAssistantRelation({
        assistantId,
        harvestUserId,
    }: {
        assistantId: TimeEntry['assistantId'];
        harvestUserId: TimeEntry['harvestUserId'];
    }) {
        return serializableTransactionWithRetry(async (manager) => {
            await manager.update(TimeEntry, { assistantId }, { assistantId: undefined });

            await manager.update(TimeEntry, { harvestUserId }, { assistantId });
        });
    }

    async setCompanyId({
        companyId,
        harvestClientId,
    }: {
        companyId: TimeEntry['companyId'];
        harvestClientId: TimeEntry['harvestClientId'];
    }) {
        return this.repository.update({ harvestClientId }, { companyId });
    }

    async updateCompanyRelation({
        companyId,
        harvestClientId,
    }: {
        companyId: TimeEntry['companyId'];
        harvestClientId: TimeEntry['harvestClientId'];
    }) {
        return serializableTransactionWithRetry(async (manager) => {
            await manager.update(TimeEntry, { companyId }, { companyId: undefined });

            await manager.update(TimeEntry, { harvestClientId }, { companyId });
        });
    }
}
