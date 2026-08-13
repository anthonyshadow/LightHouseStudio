import { useMemo } from 'react';
import { Button, SelectField } from '../../ui';
import { useCampaignList } from './useCampaignsController';

const NO_CAMPAIGN_VALUE = 'none';

export const ProjectCampaignPicker = ({
  label,
  value,
  excludeCampaignId,
  disabled = false,
  error,
  onValueChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly excludeCampaignId?: string;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly onValueChange: (value: string, label: string) => void;
}) => {
  const query = useCampaignList('active');
  const campaigns = useMemo(
    () => query.data?.pages.flatMap((page) => page.campaigns) ?? [],
    [query.data],
  );
  const options = [
    {
      value: NO_CAMPAIGN_VALUE,
      label: 'No Campaign',
      description: 'Keep this Project standalone.',
    },
    ...campaigns
      .filter(({ id }) => id !== excludeCampaignId)
      .map((campaign) => ({ value: campaign.id, label: campaign.name })),
  ];

  return (
    <>
      <SelectField
        label={label}
        value={value}
        options={options}
        busy={query.isPending}
        disabled={disabled}
        {...(error ? { error } : {})}
        onValueChange={(nextValue) =>
          onValueChange(
            nextValue,
            options.find(({ value: candidate }) => candidate === nextValue)?.label ??
              'the selected Campaign',
          )
        }
      />
      {query.hasNextPage ? (
        <Button
          variant="quiet"
          busy={query.isFetchingNextPage}
          disabled={disabled}
          onClick={() => void query.fetchNextPage()}
        >
          Load more Campaigns
        </Button>
      ) : null}
    </>
  );
};

export const projectCampaignId = (value: string): string | null =>
  value === NO_CAMPAIGN_VALUE ? null : value;
