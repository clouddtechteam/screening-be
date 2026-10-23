/**
 * PDF Naming Service
 * Enforces strict compliance file naming convention:
 * COM<Source>_<SubjectNameWithoutSpaces>_[DateType_YYYYMMDD_]<Clear|NotClear>.pdf
 *
 * Examples:
 * 1. Google Adverse Media: COMAdverseMedia_JerinDavis_Iss_20261024_Clear.pdf
 * 2. OFAC: COMOFAC_JerinDavis_Iss_20261024_Clear.pdf
 * 3. UN: COMUN_JerinDavis_Iss_20261024_Clear.pdf
 * 4. UAE: COMUAE_JerinDavis_Iss_20261024_Clear.pdf
 *
 * Rules:
 * - Remove spaces from the subject name.
 * - Only one date type is included (in YYYYMMDD format). Never include "NotSet".
 * - Append Clear or NotClear before the .pdf extension.
 */

export const SOURCE_PREFIXES = {
  ADVERSE_MEDIA: 'COMAdverseMedia',
  OFAC: 'COMOFAC',
  UN: 'COMUN',
  UAE: 'COMUAE'
};

export function sanitizeName(name) {
  if (!name) return 'Unknown';
  return name
    .trim()
    .replace(/\s+/g, '')       // Remove spaces completely
    .replace(/[^a-zA-Z0-9-]/g, ''); // Remove symbols/special chars
}

export function formatDateToYYYYMMDD(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const trimmed = dateStr.trim();
  if (trimmed === '' || trimmed.toLowerCase() === 'notset') return '';
  // Extract all digits (e.g. 2026-10-24 -> 20261024)
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length >= 8) {
    return digits.slice(0, 8);
  }
  return '';
}

export function generateEvidenceFilename({
  sourceKey,
  subjectName,
  selectedDateType = null,
  selectedDate = null,
  issDate = '',
  expDate = '',
  signedDate = '',
  matchStatus = 'CLEAR'
}) {
  const prefix = SOURCE_PREFIXES[sourceKey] || `COM${sourceKey}`;
  const cleanName = sanitizeName(subjectName);

  // Determine applicable date type and date value
  let datePart = '';
  let activeType = selectedDateType;
  let rawDate = selectedDate;

  if (!activeType) {
    if (issDate && issDate.toLowerCase() !== 'notset') {
      activeType = 'issDate';
      rawDate = issDate;
    } else if (expDate && expDate.toLowerCase() !== 'notset') {
      activeType = 'expDate';
      rawDate = expDate;
    } else if (signedDate && signedDate.toLowerCase() !== 'notset') {
      activeType = 'signedDate';
      rawDate = signedDate;
    }
  }

  if (activeType && rawDate) {
    const ymd = formatDateToYYYYMMDD(rawDate);
    if (ymd) {
      if (activeType === 'issDate' || activeType === 'Iss') {
        datePart = `_Iss_${ymd}`;
      } else if (activeType === 'expDate' || activeType === 'Exp') {
        datePart = `_Exp_${ymd}`;
      } else if (activeType === 'signedDate' || activeType === 'Signed') {
        datePart = `_Signed_${ymd}`;
      }
    }
  }

  // Outcome status: Clear or NotClear
  const isClear = matchStatus === 'CLEAR' || matchStatus === 'PASSED_CLEARED' || matchStatus === 'Clear';
  const statusSuffix = isClear ? 'Clear' : 'NotClear';

  return `${prefix}_${cleanName}${datePart}_${statusSuffix}.pdf`;
}
