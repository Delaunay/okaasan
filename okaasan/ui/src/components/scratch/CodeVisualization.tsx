import React from 'react';
import { Box, Heading, Text } from '@chakra-ui/react';

const CodeVisualization: React.FC = () => {
  return (
    <Box maxW="4xl" mx="auto" p={6}>
      <Heading size="lg" mb={3}>Code Visualization</Heading>
      <Text color="gray.600">
        Experimental space for code visualization work.
      </Text>
    </Box>
  );
};

export default CodeVisualization;
