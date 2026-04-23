import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Box, Heading, Text, SimpleGrid, Card } from '@chakra-ui/react';
import { sidebarSections } from '../layout/Layout';

const Home = () => {
  useEffect(() => {
    document.title = '(O)KaaSan - Home';
  }, []);

  return (
    <Box>
      <Box textAlign="center" mb={8}>
        <Heading size="2xl" mb={4} color="orange.500">
          Welcome to (O)KaaSan
        </Heading>
      </Box>

      <Heading size="lg" mb={6} color="gray.700">
        Sections
      </Heading>

      <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={6}>
        {sidebarSections.map((section) => (
          <Link
            key={section.href}
            to={section.href}
            style={{ textDecoration: 'none' }}
          >
            <Card.Root
              p={6}
              borderWidth="1px"
              borderRadius="lg"
              borderColor="gray.200"
              transition="all 0.2s"
              _hover={{
                borderColor: 'orange.500',
                boxShadow: 'lg',
                transform: 'translateY(-2px)'
              }}
              cursor="pointer"
              height="100%"
            >
              <Card.Body>
                <Heading size="lg" mb={3} color="gray.700">
                  {section.title}
                </Heading>
                {section.items.length > 0 && (
                  <Box>
                    <Text fontSize="sm" color="gray.500" mb={2}>
                      {section.items.length} {section.items.length === 1 ? 'feature' : 'features'}:
                    </Text>
                    <Box color="gray.600" fontSize="sm">
                      {section.items.slice(0, 4).map((item, idx) => (
                        <Text key={idx} mb={1}>
                          • {item.name}
                        </Text>
                      ))}
                      {section.items.length > 4 && (
                        <Text color="gray.500" fontStyle="italic">
                          + {section.items.length - 4} more
                        </Text>
                      )}
                    </Box>
                  </Box>
                )}
                {section.items.length === 0 && (
                  <Text fontSize="sm" color="gray.500" fontStyle="italic">
                  </Text>
                )}
              </Card.Body>
            </Card.Root>
          </Link>
        ))}
      </SimpleGrid>
    </Box>
  );
};

export default Home;