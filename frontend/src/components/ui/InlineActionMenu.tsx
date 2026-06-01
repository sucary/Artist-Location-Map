import type { ReactNode } from 'react';
import { EditIcon, TrashIcon } from '../icons/GeneralIcons';
import { MapPinIcon } from '../icons/MapIcons';

type InlineAction = {
    key: 'locate' | 'edit' | 'delete';
    label: string;
    title?: string;
    onClick?: () => void;
    dataAction?: string;
};

interface InlineActionMenuProps {
    actions: InlineAction[];
    className?: string;
}

const actionIcon: Record<InlineAction['key'], ReactNode> = {
    locate: <MapPinIcon className="h-4 w-4" />,
    edit: <EditIcon className="h-4 w-4" />,
    delete: <TrashIcon className="h-4 w-4" />,
};

const getActionClassName = (key: InlineAction['key']) => (
    key === 'delete'
        ? 'grid h-8 w-8 place-items-center rounded-full text-text-secondary transition-colors duration-150 hover:bg-[rgb(220,38,38)] hover:!text-white'
        : 'grid h-8 w-8 place-items-center rounded-full text-text-secondary transition-colors duration-150 hover:bg-border hover:text-text'
);

export function InlineActionMenu({ actions, className = 'right-0 top-1/2 -translate-y-1/2' }: InlineActionMenuProps) {
    if (actions.length === 0) return null;

    return (
        <div className={`pointer-events-none absolute inline-flex items-center rounded-full bg-surface-muted p-0.5 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 ${className}`}>
            {actions.map((action) => (
                <button
                    key={action.key}
                    type="button"
                    aria-label={action.label}
                    title={action.title}
                    onClick={action.onClick}
                    data-action={action.dataAction}
                    className={getActionClassName(action.key)}
                >
                    {actionIcon[action.key]}
                </button>
            ))}
        </div>
    );
}
