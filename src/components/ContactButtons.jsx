/**
 * Contact actions shared by every role.
 *
 * Both links are derived from a Ghanaian number: `wa.me` needs the digits with
 * the country code and no separators, and `tel:` needs the same digits prefixed
 * locally. Normalising once here means a number entered as `0545 009 046`,
 * `0545009046` or `+233545009046` produces the same two hrefs everywhere, so the
 * rest of the app never formats a phone number by hand.
 */

import { formatPhoneForDisplay, normalizePhone } from '../lib/accounts';

const DEFAULT_SUPPORT = { name: 'AquaLink Support', phone: '0545009046' };

/** Digits-only international form that wa.me and tel: both need. */
export function internationalPhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return '';
  if (normalized.startsWith('+')) return normalized.slice(1);
  if (normalized.startsWith('0')) return `233${normalized.slice(1)}`;
  return normalized;
}

export function whatsappHref(phone, message = '') {
  const base = `https://wa.me/${internationalPhone(phone)}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

export function telHref(phone) {
  return `tel:+${internationalPhone(phone)}`;
}

/** Order-aware message so the recipient knows which job this is about. */
export function orderMessage({ code, location, volume, status, eta }) {
  const lines = [
    'Hello, this is your AquaLink delivery driver.',
    `Order: ${code ?? 'your order'}`,
  ];
  if (location) lines.push(`Location: ${location}`);
  if (volume) lines.push(`Volume: ${volume}`);
  if (status) lines.push(`Status: ${status}`);
  if (eta) lines.push(`ETA: ${eta}`);
  return lines.join('\n');
}

export default function ContactButtons({ phone = DEFAULT_SUPPORT.phone, whatsapp, name = DEFAULT_SUPPORT.name, message, label = 'Message', className = '', compact = false }) {
  const hasPhone = Boolean(phone && String(phone).trim());
  if (!hasPhone) {
    return (
      <span className={`contact-buttons ${className}`.trim()}>
        <a
          className="contact-button whatsapp"
          href={whatsappHref(DEFAULT_SUPPORT.phone, message)}
          target="_blank"
          rel="noreferrer noopener"
          aria-label="Contact support"
        >
          <span aria-hidden="true">✆</span>{!compact && 'Contact support'}
        </a>
      </span>
    );
  }
  // WhatsApp and the phone number are allowed to differ: a customer may have a
  // separate WhatsApp number. wa.me targets WhatsApp, tel: dials the phone, so
  // each link uses the right one and falls back to the other when unset.
  const whatsappNumber = whatsapp || phone;
  return (
    <span className={`contact-buttons ${className}`.trim()}>
      <a
        className="contact-button whatsapp"
        href={whatsappHref(whatsappNumber, message)}
        target="_blank"
        rel="noreferrer noopener"
        aria-label={`WhatsApp ${name} ${formatPhoneForDisplay(whatsappNumber)}`}
      >
        <span aria-hidden="true">✆</span>{!compact && label}
      </a>
      <a className="contact-button call" href={telHref(phone)} aria-label={`Call ${name} ${formatPhoneForDisplay(phone)}`}>
        <span aria-hidden="true">☏</span>{!compact && 'Call'}
      </a>
    </span>
  );
}
