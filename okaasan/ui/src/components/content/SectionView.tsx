import { FC } from 'react';
import { Link } from 'react-router-dom';
import { Box, Heading, SimpleGrid, Card } from '@chakra-ui/react';

interface SectionItem {
    name: string;
    href: string;
    description?: string;
}

interface SectionViewProps {
    title: string;
    items: SectionItem[];
}

const SectionView: FC<SectionViewProps> = ({ title, items }) => {
    return (
        <Box>
            <Heading size="2xl" mb={6} color="orange.500">
                {title}
            </Heading>
            <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={6}>
                {items.map((item) => (
                    <Link
                        key={item.href}
                        to={item.href}
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
                                <Heading size="lg" mb={2} color="gray.700">
                                    {item.name}
                                </Heading>
                                {item.description && (
                                    <Box color="gray.600" fontSize="sm">
                                        {item.description}
                                    </Box>
                                )}
                            </Card.Body>
                        </Card.Root>
                    </Link>
                ))}
            </SimpleGrid>
        </Box>
    );
};

export default SectionView;




