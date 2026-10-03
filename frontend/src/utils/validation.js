export const digitsOnly = (value) => String(value || '').replace(/\D/g, '');

export const limitPhone = (value) => digitsOnly(value).slice(0, 10);

export const isValidPhone = (value) => /^\d{10}$/.test(digitsOnly(value));

export const isValidEmail = (value) => {
  const v = String(value || '').trim();
  if (!v) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
};

export const isValidStoreId = (value) => /^AP\d{2,3}$/i.test(String(value || '').trim());

export const phoneError = (value, required = false) => {
  const digits = digitsOnly(value);
  if (!digits) return required ? 'Enter a 10-digit phone number' : '';
  if (digits.length !== 10) return 'Phone number must be 10 digits';
  return '';
};

export const emailError = (value, required = false) => {
  const v = String(value || '').trim();
  if (!v) return required ? 'Email is required' : '';
  if (!isValidEmail(v)) return 'Enter a valid email';
  return '';
};

export const storeIdError = (value) => {
  const v = String(value || '').trim();
  if (!v) return 'Store ID is required';
  if (!isValidStoreId(v)) return 'Use AP + 2 or 3 digits, like AP20 or AP201';
  return '';
};

export const requiredText = (value, label = 'This field') => {
  if (!String(value || '').trim()) return `${label} is required`;
  return '';
};

export const qtyError = (value, min = 1) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min) return `Quantity must be at least ${min}`;
  return '';
};

export const passwordError = (value, required = false) => {
  const v = String(value || '');
  if (!v) return required ? 'Password is required' : '';
  if (v.length < 6) return 'Password must be at least 6 characters';
  return '';
};

export const firstError = (...errors) => errors.find(Boolean) || '';

export const phoneFieldProps = {
  inputMode: 'numeric',
  maxLength: 10
};
