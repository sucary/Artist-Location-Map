import { useState, useMemo, useId } from 'react';
import type { ComponentType, SVGProps } from 'react';
import type { SocialLinkKey } from '../../constants/artist';
import { validateSocialUrl } from '../../utils/urlValidation';
import { useTranslation } from 'react-i18next';
import { Alert } from '../ui';

// Social URL input with platform validation feedback

export interface SocialLinkField {
    key: SocialLinkKey;
    icon: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
    placeholder: string;
}

interface SocialLinkInputProps {
    field: SocialLinkField;
    value: string;
    onChange: (key: SocialLinkKey, value: string) => void;
    externalError?: string;
}

const SocialLinkInput = ({ field, value, onChange, externalError }: SocialLinkInputProps) => {
    const { key, icon: Icon, placeholder } = field;
    const [error, setError] = useState<string | null>(null);
    const [touched, setTouched] = useState(false);
    const { t } = useTranslation();
    const errorId = useId();

    const validationMessages = useMemo(() => ({
        invalidWebsite: t('artistForm.errors.invalidWebsiteUrl'),
        invalidProfile: (platform: string) => t('artistForm.errors.invalidSocialProfileUrl', { platform }),
    }), [t]);

    const isValid = useMemo(() => {
        if (!value) return false;
        return validateSocialUrl(key, value, validationMessages).isValid;
    }, [key, value, validationMessages]);

    const handleBlur = () => {
        setTouched(true);
        const result = validateSocialUrl(key, value, validationMessages);
        setError(result.error || null);
    };

    const handleChange = (newValue: string) => {
        onChange(key, newValue);
        if (error) setError(null);
    };

    const displayedError = externalError || (touched ? error : null);

    return (
        <div className="relative">
            <input
                aria-label={placeholder}
                aria-describedby={displayedError ? errorId : undefined}
                aria-invalid={Boolean(displayedError)}
                type="text"
                name={`social-${key}`}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder={placeholder}
                className={`w-full pl-9 pr-3 py-2 text-sm border rounded-lg transition-colors duration-150 focus:outline-none focus:ring-1 focus:ring-inset ${displayedError ? 'border-error focus:border-error focus:ring-error' : 'border-border focus:border-primary focus:ring-primary'}`}
                value={value}
                onChange={(e) => handleChange(e.target.value)}
                onBlur={handleBlur}
            />
            <Icon aria-hidden="true" className={`absolute left-3 top-2.5 w-4 h-4 transition-colors ${isValid ? 'text-primary' : 'text-text-muted'}`} />
            {displayedError && (
                <Alert id={errorId} variant="error" className="mt-2">
                    {displayedError}
                </Alert>
            )}
        </div>
    );
};

export default SocialLinkInput;
