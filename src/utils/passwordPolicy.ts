export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_RECOMMENDED_LENGTH = 15;
export const PASSWORD_MAX_LENGTH = 128;

export function getPasswordLengthMessage(password: string) {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (password.length < PASSWORD_RECOMMENDED_LENGTH) return `${PASSWORD_RECOMMENDED_LENGTH}+ characters recommended.`;
  return "Recommended length reached.";
}
