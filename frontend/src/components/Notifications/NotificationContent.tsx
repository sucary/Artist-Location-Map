type ContentPart =
    | { type: 'text'; value: string }
    | { type: 'link'; label: string; url: string; isInternal: boolean };

function getSafeLinkTarget(url: string): { url: string; isInternal: boolean } | null {
    const trimmedUrl = url.trim();

    // Allow app routes, but reject protocol-relative URLs.
    if (trimmedUrl.startsWith('/') && !trimmedUrl.startsWith('//')) {
        return { url: trimmedUrl, isInternal: true };
    }

    // Allow explicit web links only; keep every other scheme inert.
    if (/^https?:\/\/[^\s]+$/i.test(trimmedUrl)) {
        return { url: trimmedUrl, isInternal: false };
    }

    return null;
}

function parseContentLinks(content: string): ContentPart[] {
    const parts: ContentPart[] = [];
    const linkPattern = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    // Parse a small markdown-style subset instead of rendering arbitrary markdown or HTML.
    while ((match = linkPattern.exec(content)) !== null) {
        const [fullMatch, label, rawUrl] = match;
        const safeTarget = getSafeLinkTarget(rawUrl);
        if (!safeTarget) {
            // Leave malformed or unsafe link syntax as plain text.
            continue;
        }

        if (match.index > lastIndex) {
            parts.push({ type: 'text', value: content.slice(lastIndex, match.index) });
        }

        parts.push({
            type: 'link',
            label,
            url: safeTarget.url,
            isInternal: safeTarget.isInternal
        });
        lastIndex = match.index + fullMatch.length;
    }

    if (lastIndex < content.length) {
        parts.push({ type: 'text', value: content.slice(lastIndex) });
    }

    return parts.length > 0 ? parts : [{ type: 'text', value: content }];
}

interface NotificationContentProps {
    content: string;
    onNavigate: (url: string) => void;
}

export function NotificationContent({ content, onNavigate }: NotificationContentProps) {
    return (
        <>
            {parseContentLinks(content).map((part, index) => {
                if (part.type === 'text') {
                    return <span key={index}>{part.value}</span>;
                }

                const className = 'font-medium text-primary hover:text-primary-hover underline underline-offset-2';

                if (part.isInternal) {
                    return (
                        <a
                            key={index}
                            href={part.url}
                            className={className}
                            onClick={(event) => {
                                event.preventDefault();
                                onNavigate(part.url);
                            }}
                        >
                            {part.label}
                        </a>
                    );
                }

                return (
                    <a
                        key={index}
                        href={part.url}
                        className={className}
                        target="_blank"
                        rel="noreferrer"
                    >
                        {part.label}
                    </a>
                );
            })}
        </>
    );
}
