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

      const stampMeta = `Subject: ${subjectName} (${subjectType || 'Individual'}) | Iss: ${issDate || 'NotSet'} | Exp: ${expDate || 'NotSet'} | Signed: ${signedDate || 'NotSet'} | Check Date: ${checkDate || new Date().toISOString().split('T')[0]}`;
      safeDrawText(page, stampMeta, {
        x: 480,
        y: imgHeight + 15,
        size: 9.5,
        font: fontRegular,
        color: rgb(0.85, 0.9, 0.95),
        maxLen: 120
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

  // Fallback layout if no screenshotBuffer or screenshot embedding fails
  const page = pdfDoc.addPage([1280, 800]);
  const { width, height } = page.getSize();
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  page.drawRectangle({
    x: 0,
    y: height - 60,
    width,
    height: 60,
    color: rgb(0.08, 0.12, 0.22)
  });

  safeDrawText(page, `${(sourceTitle || 'OFFICIAL').toUpperCase()} - EVIDENCE RECORD`, {
    x: 30,
    y: height - 38,
    size: 16,
    font: fontBold,
    color: rgb(1, 1, 1),
    maxLen: 80
  });

  safeDrawText(page, `Portal: ${portalUrl || 'Official Portal'}`, {
    x: 30,
    y: height - 52,
    size: 9,
    font: fontRegular,
    color: rgb(0.8, 0.85, 0.95),
    maxLen: 150
  });

  page.drawRectangle({
    x: 40,
    y: 100,
    width: width - 80,
    height: height - 200,
    color: rgb(0.97, 0.98, 1.0),
    borderWidth: 1,
    borderColor: rgb(0.8, 0.85, 0.9)
  });

  safeDrawText(page, `Search (Ctrl+F): "${subjectName || ''}"`, {
    x: 60,
    y: height - 160,
    size: 14,
    font: fontBold,
    color: rgb(0.1, 0.15, 0.2),
    maxLen: 100
  });

  safeDrawText(page, `Status: ${matchStatus === 'POTENTIAL_MATCH' ? 'POTENTIAL MATCH DETECTED' : 'CLEARED - 0 MATCHES FOUND'}`, {
    x: 60,
    y: height - 200,
    size: 13,
    font: fontBold,
    color: matchStatus === 'POTENTIAL_MATCH' ? rgb(0.8, 0.1, 0.1) : rgb(0.1, 0.6, 0.2),
    maxLen: 60
  });

  safeDrawText(page, matchDetails || '0 records matched subject name in official registry database.', {
    x: 60,
    y: height - 240,
    size: 11,
    font: fontRegular,
    color: rgb(0.3, 0.35, 0.4),
    maxLen: 300
  });

  const pdfBytes = await pdfDoc.save();
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outputPath, pdfBytes);
  return outputPath;
}
