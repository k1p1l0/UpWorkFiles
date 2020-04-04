import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import moment from 'moment';
import { useTranslation } from 'react-i18next';
import { TFunction } from 'i18next';
import { PromiseOf } from 'Class/PromiseOf';

import useRequest from '../../../../hooks/useRequest';
import { fetchHours } from '../../../../api/requests';
import { SortDirection } from '../../../../../types/helpers';

import { Col, Row } from '../../../Common/Layout';
import Filters from './Filters';
import HoursTable from './HoursTable';
import Loader from '../../../Common/Loader';
import LoaderOverlay from '../../../Common/LoaderOverlay';
import { PageHeader } from '../../../Common/Styles';
import { UserContext } from '../../../../hoc/UserContext';

const Hours: React.FC = () => {
    const { t } = useTranslation();

    const { user } = useContext(UserContext);

    const sortColumns = useMemo(
        () => getSortColumns(t),
        [t],
    );

    const filterColumns = useMemo(
        () => getFilterColumns(t),
        [t],
    );

    const [
        { response: hours },
        hoursLoading,
        setHoursRequest,
    ] = useRequest<PromiseOf<ReturnType<typeof fetchHours>>>();

    const [page, setPage] = useState(0);
    const [perPage, setPerPage] = useState(10);
    const [sort, setSort] = useState<{
        field: string;
        direction: SortDirection;
    }>({ field: 'spentDate', direction: 'DESC' });
    const [filters, setFilters] = useState({ description: '', assistant: '', startDate: '', endDate: '' });

    const fetchData = useCallback(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const assistantId = urlParams.get('assistantId');

        setHoursRequest(
            async () => await fetchHours({
                configs: {
                    page: page + 1,
                    perPage,
                    sortBy: sort.field,
                    direction: sort.direction,
                    description: filters.description.length ? filters.description : undefined,
                    assistantName: filters.assistant.length ? filters.assistant : undefined,
                    assistantId: assistantId ? parseInt(assistantId, 10) : undefined,
                    from: filters.startDate.length
                        ? moment(filters.startDate, 'DD.MM.YYYY').format('YYYY-MM-DD')
                        : undefined,
                    to: filters.endDate.length
                        ? moment(filters.endDate, 'DD.MM.YYYY').format('YYYY-MM-DD')
                        : undefined,
                },
            }),
        );
    }, [setHoursRequest, page, perPage, sort, filters, user.info.id]);

    const setFiltersFromArray = useCallback(([description, assistant, startDate, endDate]: string[]) => {
        setFilters({
            description,
            assistant,
            startDate,
            endDate,
        });
    }, [setFilters]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleSort = useCallback((field: string) => {
        if (sort.field === field) {
            setSort({ field: sort.field, direction: sort.direction === 'ASC' ? 'DESC' : 'ASC' });
        } else {
            setSort({ field, direction: 'ASC' });
        }
    }, [sort, setSort]);

    return (
        <Wrapper>
            <HeaderSection>
                <PageHeader>{t('hours.title')}</PageHeader>
                {/*<ExportButton>{t('hours.exportToExcel')}</ExportButton>*/}
            </HeaderSection>

            <Filters
                filterColumns={filterColumns}
                sortColumns={sortColumns}
                sort={{ ...sort, setSort: handleSort }}
                onChangeFilters={setFiltersFromArray}
            />

            {hoursLoading && !hours && (
                <Loader
                    color='orange'
                    size='md'
                    height='400px'
                />
            )}
            {hours && (
                <HoursTableWrapper>
                    <HoursTable
                        columns={sortColumns}
                        hourEntries={hours.data.timeEntries}
                        totalHours={hours.data.totalHoursTracked}
                        pagination={{ page, setPage, perPage, total: hours.data.count }}
                        sort={{ ...sort, setSort: handleSort }}
                    />
                    {hoursLoading && (
                        <LoaderOverlay
                            color='orange'
                            size='md'
                        />
                    )}
                </HoursTableWrapper>
            )}
        </Wrapper>
    );
};

function getFilterColumns(t: TFunction): React.ComponentProps<typeof Filters>['filterColumns'] {
    return [
        {
            key: 'description',
            placeholder: t('hours.filters.description.title'),
            type: 'text',
        },
        {
            key: 'assistant',
            placeholder: t('hours.filters.assistant.title'),
            type: 'text',
        },
        {
            key: 'startDate',
            placeholder: t('hours.filters.startDate.title'),
            type: 'date',
        },
        {
            key: 'endDate',
            placeholder: t('hours.filters.endDate.title'),
            type: 'date',
        },
    ];
}

function getSortColumns(t: TFunction): NonNullable<React.ComponentProps<typeof Filters>['sortColumns']> {
    return [
        {
            key: 'description',
            title: t('hours.columns.description.title'),
        },
        {
            key: 'assistant',
            title: t('hours.columns.assistant.title'),
        },
        {
            key: 'spentDate',
            title: t('hours.columns.spentDate.title'),
        },
        {
            key: 'hoursTracked',
            title: t('hours.columns.hoursTracked.title'),
        },
    ];
}

const HoursTableWrapper = styled.div`
  width: 100%;
  position: relative;
`;

const Wrapper = styled(Col)`
  width: 100%;
`;

const HeaderSection = styled(Row)`
  justify-content: space-between;
`;

const ExportButton = styled.button`
  width: 140px;
  height: 38px;
  border-radius: 24px;
  box-shadow: 0 4px 8px 0 ${({ theme }) => theme.colors.shadow_grey};
  background-color: #ffffff;
  border: none;
  font-family: 'Helvetica', sans-serif;
  font-size: 12px;
  text-align: center;
  color: ${({ theme }) => theme.colors.grey};
  text-transform: uppercase;
  white-space: nowrap;
  padding: 7px 16px;
  cursor: pointer;
  outline: none;

  &:hover, &:focus {
    background: ${({ theme }) => theme.colors.grey_input};
  }
`;

export default Hours;
