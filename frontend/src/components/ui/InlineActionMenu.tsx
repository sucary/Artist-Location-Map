import type { ReactNode } from 'react';
import { EditIcon, StarIcon, TrashIcon } from '../icons/GeneralIcons';
import { MapPinIcon } from '../icons/MapIcons';

type InlineAction = {
    key: 'locate' | 'star' | 'edit' | 'delete';
    label: string;
    title?: string;
    onClick?: () => void;
    dataAction?: string;
    active?: boolean;
};

interface InlineActionMenuProps {
    actions: InlineAction[];
    className?: string;
    alwaysVisible?: boolean;
}

const actionIcon: Record<InlineAction['key'], ReactNode> = {
    locate: <MapPinIcon className="h-4 w-4" />,
    star: <StarIcon className="h-3.5 w-3.5" />,
    edit: <EditIcon className="h-4 w-4" />,
    delete: <TrashIcon className="h-4 w-4" />,
};

const getActionClassName = (action: InlineAction) => {
    if (action.key === 'delete') {
        return 'grid h-8 w-8 place-items-center rounded-full text-text-secondary transition-colors duration-150 hover:bg-[rgb(220,38,38)] hover:!text-white';
    }

    return 'grid h-8 w-8 place-items-center rounded-full text-text-secondary transition-colors duration-150 hover:bg-[#D1D5DB] hover:text-text app-dark:hover:bg-[#3A3A3C]';
};

export function InlineActionMenu({ actions, className = 'right-0 top-1/2 -translate-y-1/2', alwaysVisible = false }: InlineActionMenuProps) {
    if (actions.length === 0) return null;

    return (
        <div className={`${alwaysVisible ? 'inline-flex' : 'pointer-events-none absolute inline-flex opacity-0 group-hover:pointer-events-auto group-hover:opacity-100'} items-center rounded-full bg-surface-muted p-0.5 transition-opacity ${className}`}>
            {actions.map((action) => (
                <button
                    key={action.key}
                    type="button"
                    aria-label={action.label}
                    title={action.title}
                    onClick={action.onClick}
                    data-action={action.dataAction}
                    className={getActionClassName(action)}
                >
                    {action.key === 'star' ? <StarIcon className="h-3.5 w-3.5" filled={action.active} /> : actionIcon[action.key]}
                </button>
            ))}
        </div>
    );
}
