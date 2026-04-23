import { FC, useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

export interface SidebarItem {
    name: string;
    href: string;
}

export interface SidebarSection {
    title: string;
    href: string;
    items: SidebarItem[];
    fetch?: () => Promise<SidebarItem[]>;
}

interface SidebarSectionProps {
    section: SidebarSection;
    isExpanded: boolean;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onItemClick: () => void;
}

const ChevronIcon = ({ isExpanded }: { isExpanded: boolean }) => (
    <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="currentColor"
        style={{
            transition: 'transform 0.3s ease',
            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            display: 'inline-block',
            marginRight: '0.5rem'
        }}
    >
        <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
    </svg>
);

const SidebarSection: FC<SidebarSectionProps> = ({
    section,
    isExpanded,
    onMouseEnter,
    onMouseLeave,
    onItemClick
}) => {
    const location = useLocation();
    const [dynamicItems, setDynamicItems] = useState<SidebarItem[]>(section.items);
    const hasFetchFunction = !!section.fetch;

    // Fetch dynamic items if section has a fetch function
    useEffect(() => {
        if (hasFetchFunction && section.fetch) {
            const loadItems = async () => {
                try {
                    const items = await section.fetch!();
                    setDynamicItems(items);
                } catch (error) {
                    console.error(`Failed to fetch items for section "${section.title}":`, error);
                    // Keep default items on error
                }
            };

            loadItems();
        }
    }, [hasFetchFunction, section.fetch, section.title]);

    // Use dynamic items if section has fetch function, otherwise use static items
    const itemsToRender = hasFetchFunction ? dynamicItems : section.items;

    return (
        <div
            className={`nav-section ${isExpanded ? 'expanded' : 'collapsed'}`}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            <Link
                to={section.href}
                className={`nav-section-title ${location.pathname === section.href ? 'active-section' : ''}`}
                onClick={onItemClick}
            >
                <ChevronIcon isExpanded={isExpanded} />
                {section.title}
            </Link>
            <div className="nav-section-items">
                {itemsToRender.map((item) => {
                    const itemPath = item.href;//.split('?')[0];
                    const currentFullPath = location.pathname + location.search;
                    const isActive = currentFullPath === item.href || location.pathname === itemPath;

                    return (
                        <Link
                            key={item.name}
                            to={item.href}
                            className={`nav-item ${isActive ? 'active' : ''}`}
                            onClick={onItemClick}
                        >
                            {item.name}
                        </Link>
                    );
                })}
            </div>
        </div>
    );
};

export default SidebarSection;

