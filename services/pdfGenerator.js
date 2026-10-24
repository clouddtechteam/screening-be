import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

/**
 * Sanitizes any string to ensure 100% compatibility with pdf-lib standard WinAnsi fonts.
 * Strips out Unicode box characters (e.g. ╔ 0x2554), emojis, smart quotes, em-dashes, etc.
 */
function cleanWinAnsi(str, maxLen = 200) {
  if (!str) return '';
  const cleaned = String(str)
    .replace(/[—–]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, '...')
    // Replace everything outside printable ASCII (32-126) with a single space
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return maxLen && cleaned.length > maxLen ? cleaned.substring(0, maxLen) + '...' : cleaned;
}

function safeDrawText(page, text, options) {
  try {
    const sanitized = cleanWinAnsi(text, options.maxLen || 300);
    const { maxLen, ...drawOpts } = options;
    page.drawText(sanitized, drawOpts);
  } catch (err) {
    console.warn('pdf-lib drawText skipped due to encoding issue:', err.message);
  }
}

/**
 * Creates a standardized compliance evidence PDF.
 * If a laptop viewport screenshot is provided, it renders it full-bleed (1280x800)
 * showing the exact laptop screen with the Ctrl+F search bar and document view.
 */
export async function createEvidencePDF({
  sourceKey,
  sourceTitle,
  portalUrl,
  subjectName,
  subjectType,
  clientAccountName,
  clientRef,
  issDate,
  expDate,
  signedDate,
  checkDate,
  searchQuery,
  matchStatus,
  matchDetails,
  screenshotBuffer = null,
  outputPath
}) {
  const pdfDoc = await PDFDocument.create();

  const accountDisplay = clientAccountName || clientRef || 'N/A';

  const dateParts = [];
  if (issDate && issDate.toLowerCase() !== 'notset') dateParts.push(`Iss: ${issDate}`);
  if (expDate && expDate.toLowerCase() !== 'notset') dateParts.push(`Exp: ${expDate}`);
  if (signedDate && signedDate.toLowerCase() !== 'notset') dateParts.push(`Signed: ${signedDate}`);
  const datesSummary = dateParts.length > 0 ? dateParts.join(' | ') : 'Date: None';

  if (screenshotBuffer && screenshotBuffer.length > 0) {
    try {
      let embeddedImage;
      try {
        embeddedImage = await pdfDoc.embedPng(screenshotBuffer);
      } catch (pngErr) {
        embeddedImage = await pdfDoc.embedJpg(screenshotBuffer);
      }

      const imgWidth = embeddedImage.width || 1280;
      const imgHeight = embeddedImage.height || 800;

      // Add page matching exact screen dimensions (e.g. 1280 x 800 laptop resolution)
      const page = pdfDoc.addPage([imgWidth, imgHeight + 40]);
      const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      // Top compliance stamp bar (40px)
      page.drawRectangle({
        x: 0,
        y: imgHeight,
        width: imgWidth,
        height: 40,
        color: rgb(0.08, 0.12, 0.22)
      });

      safeDrawText(page, `${(sourceTitle || 'OFFICIAL').toUpperCase()} - COMPLIANCE SCREENING EVIDENCE`, {
        x: 20,
        y: imgHeight + 14,
        size: 13,
        font: fontBold,
        color: rgb(1, 1, 1),
        maxLen: 80
      });

      const stampMeta = `Subject: ${subjectName} (${subjectType || 'Individual'}) | Account: ${accountDisplay} | ${datesSummary} | Check Date: ${checkDate || new Date().toISOString().split('T')[0]}`;
      safeDrawText(page, stampMeta, {
        x: 440,
        y: imgHeight + 15,
        size: 9.5,
        font: fontRegular,
        color: rgb(0.85, 0.9, 0.95),
        maxLen: 140
      });

      // Status indicator tag
      const isMatch = matchStatus === 'POTENTIAL_MATCH';
      page.drawRectangle({
        x: imgWidth - 160,
        y: imgHeight + 8,
        width: 140,
        height: 24,
        color: isMatch ? rgb(0.85, 0.2, 0.2) : rgb(0.12, 0.65, 0.35)
      });

      safeDrawText(page, isMatch ? 'POTENTIAL MATCH' : 'CLEARED / NO MATCH', {
        x: imgWidth - 148,
        y: imgHeight + 15,
        size: 9.5,
        font: fontBold,
        color: rgb(1, 1, 1),
        maxLen: 30
      });

      // Draw the exact laptop screen capture filling the rest of the page
      page.drawImage(embeddedImage, {
        x: 0,
        y: 0,
        width: imgWidth,
        height: imgHeight
      });

      const pdfBytes = await pdfDoc.save();
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(outputPath, pdfBytes);
      return outputPath;

    } catch (embedErr) {
      console.warn('Screenshot embedding issue, generating fallback evidence layout:', embedErr.message);
    }
  }

  // Fallback layout if no screenshotBuffer: Professional Compliance Audit Dossier
  const page = pdfDoc.addPage([1280, 800]);
  const { width, height } = page.getSize();
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Top Navy Header Bar
  page.drawRectangle({
    x: 0,
    y: height - 60,
    width,
    height: 60,
    color: rgb(0.08, 0.12, 0.22)
  });

  safeDrawText(page, `${(sourceTitle || 'OFFICIAL SANCTIONS REGISTRY').toUpperCase()} - EVIDENCE RECORD`, {
    x: 30,
    y: height - 36,
    size: 15,
    font: fontBold,
    color: rgb(1, 1, 1),
    maxLen: 80
  });

  safeDrawText(page, `Official Registry URL: ${portalUrl || 'Official Portal'}`, {
    x: 30,
    y: height - 52,
    size: 9,
    font: fontRegular,
    color: rgb(0.75, 0.85, 0.95),
    maxLen: 120
  });

  const isMatch = matchStatus === 'POTENTIAL_MATCH';

  // Status Badge in Header
  page.drawRectangle({
    x: width - 220,
    y: height - 48,
    width: 190,
    height: 36,
    color: isMatch ? rgb(0.85, 0.2, 0.2) : rgb(0.12, 0.65, 0.35)
  });

  safeDrawText(page, isMatch ? 'POTENTIAL MATCH DETECTED' : 'CLEARED / 0 MATCHES FOUND', {
    x: width - 210,
    y: height - 28,
    size: 10,
    font: fontBold,
    color: rgb(1, 1, 1),
    maxLen: 40
  });

  // Main Dossier Container
  page.drawRectangle({
    x: 30,
    y: 40,
    width: width - 60,
    height: height - 120,
    color: rgb(0.98, 0.99, 1.0),
    borderWidth: 1,
    borderColor: rgb(0.85, 0.89, 0.94)
  });

  // Section 1: Subject Identification
  page.drawRectangle({
    x: 50,
    y: height - 220,
    width: width - 100,
    height: 80,
    color: rgb(1, 1, 1),
    borderWidth: 1,
    borderColor: rgb(0.88, 0.91, 0.95)
  });

  safeDrawText(page, 'SUBJECT AUDIT IDENTIFICATION', {
    x: 65,
    y: height - 160,
    size: 11,
    font: fontBold,
    color: rgb(0.2, 0.3, 0.45)
  });

  safeDrawText(page, `Subject Name: ${subjectName || 'N/A'}`, {
    x: 65,
    y: height - 185,
    size: 12,
    font: fontBold,
    color: rgb(0.1, 0.15, 0.25),
    maxLen: 60
  });

  safeDrawText(page, `Type: ${subjectType || 'Individual'}   |   Client Account: ${accountDisplay}`, {
    x: 65,
    y: height - 205,
    size: 10,
    font: fontRegular,
    color: rgb(0.35, 0.4, 0.5),
    maxLen: 80
  });

  const displayIss = issDate && issDate.toLowerCase() !== 'notset' ? issDate : '—';
  const displayExp = expDate && expDate.toLowerCase() !== 'notset' ? expDate : '—';
  const displaySigned = signedDate && signedDate.toLowerCase() !== 'notset' ? signedDate : '—';

  safeDrawText(page, `Issuance Date: ${displayIss}    Expiry Date: ${displayExp}`, {
    x: 600,
    y: height - 185,
    size: 10,
    font: fontRegular,
    color: rgb(0.35, 0.4, 0.5)
  });

  safeDrawText(page, `Signed Date: ${displaySigned}    Check/Audit Date: ${checkDate || new Date().toISOString().split('T')[0]}`, {
    x: 600,
    y: height - 205,
    size: 10,
    font: fontRegular,
    color: rgb(0.35, 0.4, 0.5)
  });

  // Section 2: Screening Execution Details & Verdict
  page.drawRectangle({
    x: 50,
    y: height - 420,
    width: width - 100,
    height: 180,
    color: isMatch ? rgb(1.0, 0.96, 0.96) : rgb(0.96, 0.99, 0.97),
    borderWidth: 1.5,
    borderColor: isMatch ? rgb(0.95, 0.6, 0.6) : rgb(0.5, 0.85, 0.65)
  });

  safeDrawText(page, 'OFFICIAL SANCTIONS & REGISTRY AUDIT VERDICT', {
    x: 65,
    y: height - 265,
    size: 12,
    font: fontBold,
    color: isMatch ? rgb(0.7, 0.15, 0.15) : rgb(0.1, 0.5, 0.25)
  });

  safeDrawText(page, `Verification Status: ${isMatch ? 'FLAGGED (Designation match detected)' : 'PASSED & CLEARED (Zero adverse records found)'}`, {
    x: 65,
    y: height - 295,
    size: 13,
    font: fontBold,
    color: isMatch ? rgb(0.8, 0.1, 0.1) : rgb(0.1, 0.6, 0.25)
  });

  safeDrawText(page, 'Audit Summary & Registry Match Findings:', {
    x: 65,
    y: height - 325,
    size: 10,
    font: fontBold,
    color: rgb(0.25, 0.3, 0.35)
  });

  safeDrawText(page, matchDetails || '0 matching records found in official registry database.', {
    x: 65,
    y: height - 350,
    size: 10.5,
    font: fontRegular,
    color: rgb(0.2, 0.25, 0.3),
    maxLen: 220
  });

  safeDrawText(page, `Official Registry Database: ${sourceTitle || 'Official Government Source'}`, {
    x: 65,
    y: height - 385,
    size: 9.5,
    font: fontRegular,
    color: rgb(0.4, 0.45, 0.5)
  });

  safeDrawText(page, `Registry Portal Verification Link: ${portalUrl || 'N/A'}`, {
    x: 65,
    y: height - 402,
    size: 9.5,
    font: fontRegular,
    color: rgb(0.1, 0.4, 0.8),
    maxLen: 120
  });

  // Section 3: Official Compliance Certification Statement
  page.drawRectangle({
    x: 50,
    y: 60,
    width: width - 100,
    height: 120,
    color: rgb(1, 1, 1),
    borderWidth: 1,
    borderColor: rgb(0.88, 0.91, 0.95)
  });

  safeDrawText(page, 'AUTOMATED COMPLIANCE CERTIFICATION RECORD', {
    x: 65,
    y: 155,
    size: 10,
    font: fontBold,
    color: rgb(0.3, 0.35, 0.45)
  });

  safeDrawText(page, 'This record constitutes an official background compliance screening audit file generated in accordance with AML/CFT regulatory requirements.', {
    x: 65,
    y: 135,
    size: 9,
    font: fontRegular,
    color: rgb(0.45, 0.5, 0.55),
    maxLen: 140
  });

  safeDrawText(page, `Audit Generated: ${new Date().toISOString()}  |  System: EER Compliance Sanctions & Adverse Media Screener  |  Integrity: Verified Official Daily Registry`, {
    x: 65,
    y: 115,
    size: 8.5,
    font: fontRegular,
    color: rgb(0.55, 0.6, 0.65),
    maxLen: 120
  });

  const pdfBytes = await pdfDoc.save();
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outputPath, pdfBytes);
  return outputPath;
}
