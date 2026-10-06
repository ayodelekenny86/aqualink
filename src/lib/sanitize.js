// Input sanitization and security utilities

/**
 * Sanitize HTML to prevent XSS
 * Strips all HTML tags and encodes special characters
 */
export function sanitizeHtml(input) {
  if (typeof input !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = input;
  return div.innerHTML;
}

/**
 * Sanitize plain text input (trim, remove control chars)
 */
export function sanitizeText(input, maxLength = 1000) {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .trim()
    .slice(0, maxLength);
}

/**
 * Sanitize phone number - keep only digits, +, -, spaces, parentheses
 */
export function sanitizePhone(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/[^\d+\-()\s]/g, '').trim();
}

/**
 * Sanitize email - basic validation and normalization
 */
export function sanitizeEmail(input) {
  if (typeof input !== 'string') return '';
  return input.trim().toLowerCase().slice(0, 254);
}

/**
 * Sanitize currency amount - only digits and decimal point
 */
export function sanitizeAmount(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/[^\d.]/g, '').replace(/^0+(?=\d)/, '');
}

/**
 * Sanitize for use in SQL-like queries (basic)
 */
export function sanitizeSqlInput(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/['";\\]/g, '');
}

/**
 * Content Security Policy nonce generator for inline scripts
 */
export function generateCspNonce() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Validate and sanitize form data object
 */
export function sanitizeFormData(data, schema) {
  const result = {};
  const errors = {};
  
  for (const [key, rules] of Object.entries(schema)) {
    const value = data[key];
    const sanitized = rules.sanitize ? rules.sanitize(value) : sanitizeText(value);
    
    if (rules.required && (!sanitized || sanitized.length === 0)) {
      errors[key] = `${rules.label || key} is required`;
      continue;
    }
    
    if (rules.minLength && sanitized.length < rules.minLength) {
      errors[key] = `${rules.label || key} must be at least ${rules.minLength} characters`;
      continue;
    }
    
    if (rules.maxLength && sanitized.length > rules.maxLength) {
      errors[key] = `${rules.label || key} must be at most ${rules.maxLength} characters`;
      continue;
    }
    
    if (rules.pattern && !rules.pattern.test(sanitized)) {
      errors[key] = rules.message || `${rules.label || key} is invalid`;
      continue;
    }
    
    if (rules.custom && !rules.custom(sanitized)) {
      errors[key] = rules.message || `${rules.label || key} is invalid`;
      continue;
    }
    
    result[key] = sanitized;
  }
  
  return { data: result, errors, isValid: Object.keys(errors).length === 0 };
}

/**
 * Rate limiter for client-side actions
 */
export class RateLimiter {
  constructor(maxRequests = 10, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = new Map();
  }
  
  check(key) {
    const now = Date.now();
    const userRequests = this.requests.get(key) || [];
    const validRequests = userRequests.filter((ts) => now - ts < this.windowMs);
    
    if (validRequests.length >= this.maxRequests) {
      return { allowed: false, retryAfter: this.windowMs - (now - validRequests[0]) };
    }
    
    validRequests.push(now);
    this.requests.set(key, validRequests);
    return { allowed: true };
  }
  
  reset(key) {
    this.requests.delete(key);
  }
}

/**
 * Secure random ID generator
 */
export function generateSecureId(prefix = '', length = 16) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  const id = Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return prefix ? `${prefix}_${id}` : id;
}

/**
 * Check if running in secure context (HTTPS or localhost)
 */
export function isSecureContext() {
  if (typeof window === 'undefined') return false;
  return window.isSecureContext || 
    location.protocol === 'https:' || 
    location.hostname === 'localhost' || 
    location.hostname === '127.0.0.1';
}

/**
 * Safe JSON parse with fallback
 */
export function safeJsonParse(json, fallback = null) {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

/**
 * Debounce function for input handlers
 */
export function debounce(fn, delay = 300) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Throttle function for scroll/resize handlers
 */
export function throttle(fn, limit = 100) {
  let inThrottle;
  return (...args) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}