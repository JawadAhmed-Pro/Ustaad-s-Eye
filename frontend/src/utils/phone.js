/**
 * Clean phone numbers to international WhatsApp format (e.g. 0312-1234567 -> 923121234567)
 */
export function cleanPhoneNumber(phone) {
  if (!phone) return '923121234567'
  let digits = String(phone).replace(/\D/g, '')
  if (digits.startsWith('0') && digits.length === 11) {
    digits = '92' + digits.slice(1)
  } else if (digits.length === 10 && digits.startsWith('3')) {
    digits = '92' + digits
  } else if (digits.startsWith('0')) {
    digits = '92' + digits.replace(/^0+/, '')
  }
  return digits || '923121234567'
}
