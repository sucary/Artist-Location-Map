import type { ComponentPropsWithoutRef } from 'react';

type TransSpanProps = ComponentPropsWithoutRef<'span'> & {
    i18nIsDynamicList?: boolean;
};

type TransStrongProps = ComponentPropsWithoutRef<'strong'> & {
    i18nIsDynamicList?: boolean;
};

export const TransSpan = (props: TransSpanProps) => {
    const spanProps = { ...props };
    delete spanProps.i18nIsDynamicList;

    return <span {...spanProps} />;
};

export const TransStrong = (props: TransStrongProps) => {
    const strongProps = { ...props };
    delete strongProps.i18nIsDynamicList;

    return <strong {...strongProps} />;
};
