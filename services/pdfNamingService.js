/**
 * PDF Naming Service
 * Enforces strict compliance file naming convention:
 * 1. Google Adverse Media: COMAdverseMedia_<SubjectName>_Iss_<date>_Exp_<date>_Signed_<date>.pdf
 * 2. OFAC: COMOFAC_<SubjectName>_Iss_<date>_Exp_<date>_Signed_<date>.pdf
 * 3. UN: COMUN_<SubjectName>_Iss_<date>_Exp_<date>_Signed_<date>.pdf
 * 4. UAE: COMUAE_<SubjectName>_Iss_<date>_Exp_<date>_Signed_<date>.pdf
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
    .replace(/[^\w\s-]/g, '') // remove special symbols
    .replace(/\s+/g, '_');    // replace spaces with underscores
}

export function sanitizeDate(dateStr, fallback = 'NotSet') {
  if (!dateStr || dateStr.trim() === '') return fallback;
  // Convert standard ISO date or string to YYYY-MM-DD or clean string
  const clean = dateStr.trim().replace(/[/\\:]/g, '-');
  return clean || fallback;
}

export function generateEvidenceFilename({ sourceKey, subjectName, issDate, expDate, signedDate }) {
  const prefix = SOURCE_PREFIXES[sourceKey] || `COM${sourceKey}`;
  const cleanName = sanitizeName(subjectName);
  const cleanIss = sanitizeDate(issDate, 'NotSet');
  const cleanExp = sanitizeDate(expDate, 'NotSet');
  const cleanSigned = sanitizeDate(signedDate, 'NotSet');

  return `${prefix}_${cleanName}_Iss_${cleanIss}_Exp_${cleanExp}_Signed_${cleanSigned}.pdf`;
}
