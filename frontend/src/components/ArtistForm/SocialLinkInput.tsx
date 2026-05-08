import { useState, useMemo } from 'react';
import type { ComponentType, SVGProps } from 'react';
import type { SocialLinkKey } from '../../constants/artist';
import { validateSocialUrl } from '../../utils/urlValidation';
import { useTranslation } from 'react-i18next';
import { Alert } from '../ui';

export interface SocialLinkField {
    key: SocialLinkKey;
    icon: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;
    placeholder: string;
}

interface SocialLinkInputProps {
    field: SocialLinkField;
    value: string;
    onChange: (key: SocialLinkKey, value: string) => void;
}

const SocialLinkInput = ({ field, value, onChange }: SocialLinkInputProps) => {
    const { key, icon: Icon, placeholder } = field;
    const [error, setError] = useState<string | null>(null);
    const [touched, setTouched] = useState(false);
    const { t } = useTranslation();

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

    return (
        <div className="relative">
            <input
                aria-label={placeholder}
                type="text"
                name={`social-${key}`}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder={placeholder}
                className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-inset focus:ring-primary"
                value={value}
                onChange={(e) => handleChange(e.target.value)}
                onBlur={handleBlur}
            />
            <Icon aria-hidden="true" className={`absolute left-3 top-2.5 w-4 h-4 transition-colors ${isValid ? 'text-primary' : 'text-text-muted'}`} />
            {touched && error && (
                <Alert variant="error" className="mt-2">
                    {error}
                </Alert>
            )}
        </div>
    );
};

export default SocialLinkInput;
