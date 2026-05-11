// Shared username normalization and validation policy

// Username length and character rules
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;
export const USERNAME_PATTERN = /^[a-z0-9_]+$/;

export function normalizeUsername(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
}

export function isValidUsername(value: string | null): value is string {
    return Boolean(
        value &&
        value.length >= USERNAME_MIN_LENGTH &&
        value.length <= USERNAME_MAX_LENGTH &&
        USERNAME_PATTERN.test(value)
    );
}

export function usernameValidationMessage(): string {
    return `Username must be ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} characters and contain lowercase letters, numbers, or underscores only`;
}
