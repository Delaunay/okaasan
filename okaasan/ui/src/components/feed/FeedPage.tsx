import { FC, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Heading, HStack, Button } from '@chakra-ui/react';
import ChangeFeed from './ChangeFeed';
import ReportView from './ReportView';

type Tab = 'changes' | 'report';

const FeedPage: FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as Tab) || 'changes';
  const [tab, setTab] = useState<Tab>(initialTab);

  const switchTab = (t: Tab) => {
    setTab(t);
    if (t === 'changes') {
      setSearchParams({});
    } else {
      setSearchParams({ tab: t });
    }
  };

  return (
    <Box>
      <HStack justify="space-between" align="center" mb={6}>
        <Heading size="2xl" color="orange.500">
          Feed
        </Heading>
      </HStack>

      <HStack gap={2} mb={6}>
        <Button
          size="sm"
          variant={tab === 'changes' ? 'solid' : 'outline'}
          colorPalette={tab === 'changes' ? 'orange' : undefined}
          onClick={() => switchTab('changes')}
        >
          Changes
        </Button>
        <Button
          size="sm"
          variant={tab === 'report' ? 'solid' : 'outline'}
          colorPalette={tab === 'report' ? 'orange' : undefined}
          onClick={() => switchTab('report')}
        >
          Report
        </Button>
      </HStack>

      {tab === 'changes' ? <ChangeFeed /> : <ReportView />}
    </Box>
  );
};

export default FeedPage;
