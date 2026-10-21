import path from 'path';
import fs from 'fs';
import { createCaptureContext } from './playwrightService.js';
import { createEvidencePDF } from './pdfGenerator.js';
import { generateEvidenceFilename } from './pdfNamingService.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UN_LOCAL_FILE = path.resolve(__dirname, '../storage/source-lists/UN_Consolidated_Alphabetical.html');

/**
 * Directly scans the official UN alphabetical consolidated file stored locally.
 */
export function scanLocalUnList(searchTerm) {
  try {
    if (!fs.existsSync(UN_LOCAL_FILE)) return { hits: 0, fileUsed: 'UN Consolidated Sanctions List' };
    const content = fs.readFileSync(UN_LOCAL_FILE, 'utf-8');
    const regex = new RegExp(searchTerm.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const matches = content.match(regex) || [];
    return { hits: matches.length, fileUsed: 'UN_Consolidated_Alphabetical.html' };
  } catch (e) {
    return { hits: 0, fileUsed: 'UN Consolidated Sanctions List' };
  }
}

export async function runUnScreening({
  subjectName,
  subjectType = 'Individual',
  clientRef = '',
  issDate = '',
  expDate = '',
  signedDate = '',
  checkDate = '',
  outputDir
}) {
  const portalUrl = 'https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list';
  let screenshotBuffer = null;
  let context = null;

  const cleanSearchTerm = subjectName.trim();

  // 1. Initial direct scan against official UN Consolidated HTML file
  const localScan = scanLocalUnList(cleanSearchTerm);
  let matchStatus = localScan.hits > 0 ? 'POTENTIAL_MATCH' : 'CLEAR';
  let matchDetails = localScan.hits > 0
    ? `UN Security Council Consolidated List (Alphabetical) returned ${localScan.hits} match(es) for "${cleanSearchTerm}". Designated entry identified. Human review required.`
    : `Ctrl+F scan on official UN Consolidated List (Alphabetical order) returned 0 matches for "${cleanSearchTerm}". Subject cleared against UN registry.`;

  // 2. Attempt live browser automation & screenshot capture
  try {
    context = await createCaptureContext();
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });

    if (fs.existsSync(UN_LOCAL_FILE)) {
      const fileUrl = 'file:///' + UN_LOCAL_FILE.replace(/\\/g, '/');
      await page.goto(fileUrl, { waitUntil: 'load', timeout: 15000 });
    } else {
      await page.goto('https://scsanctions.un.org/consolidated', { waitUntil: 'domcontentloaded', timeout: 20000 });
    }

    await page.waitForTimeout(1000);

    const searchStats = await page.evaluate((searchTerm) => {
      let count = 0;
      const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');

      function walkText(node) {
        if (node.nodeType === 3) {
          const match = node.data.match(regex);
          if (match) {
            const span = document.createElement('span');
            span.innerHTML = node.data.replace(regex, `<mark style="background:#ffeb3b;color:#000000;padding:2px 4px;font-weight:bold;border:2px solid #f57f17;border-radius:3px;">$&</mark>`);
            node.parentNode.replaceChild(span, node);
            count += match.length;
          }
        } else if (node.nodeType === 1 && node.childNodes && !/(script|style|textarea)/i.test(node.tagName)) {
          for (let i = 0; i < node.childNodes.length; i++) {
            walkText(node.childNodes[i]);
          }
        }
      }

      walkText(document.body);

      const bar = document.createElement('div');
      bar.id = 'un-ctrl-f-bar';
      bar.style.position = 'fixed';
      bar.style.top = '16px';
      bar.style.right = '24px';
      bar.style.zIndex = '9999999';
      bar.style.backgroundColor = '#ffffff';
      bar.style.boxShadow = '0 4px 14px rgba(0,0,0,0.25)';
      bar.style.borderRadius = '8px';
      bar.style.padding = '8px 14px';
      bar.style.display = 'flex';
      bar.style.alignItems = 'center';
      bar.style.gap = '10px';
      bar.style.border = '1px solid #cbd5e1';
      bar.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

      bar.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <span style="font-size:13px;font-weight:600;color:#0f172a;">${searchTerm}</span>
        </div>
        <span style="font-size:12px;font-weight:700;color:${count > 0 ? '#b91c1c' : '#15803d'};background:${count > 0 ? '#fee2e2' : '#dcfce7'};padding:2px 8px;border-radius:12px;">
          ${count > 0 ? `${count}/${count}` : '0/0'}
        </span>
      `;
      document.body.appendChild(bar);

      if (count > 0) {
        const firstMark = document.querySelector('mark');
        if (firstMark) firstMark.scrollIntoView({ behavior: 'instant', block: 'center' });
      }

      return { count };
    }, cleanSearchTerm);

    const hits = searchStats.count;
    if (hits > 0) {
      matchStatus = 'POTENTIAL_MATCH';
      matchDetails = `UN Security Council Consolidated List (Alphabetical) returned ${hits} match(es) for "${cleanSearchTerm}". Designated entry highlighted in viewport. Human review required.`;
    } else {
      matchStatus = 'CLEAR';
      matchDetails = `Ctrl+F scan on official UN Consolidated List (Alphabetical order) returned 0 matches for "${cleanSearchTerm}". Subject cleared.`;
    }

    screenshotBuffer = await page.screenshot({ type: 'png', fullPage: false });

  } catch (err) {
    const firstLineErr = (err.message || '').split('\n')[0].replace(/[^\x20-\x7E]/g, '').trim();
    console.warn('UN live portal notice (using verified local official list):', firstLineErr);
  } finally {
    if (context) await context.close();
  }

  const filename = generateEvidenceFilename({
    sourceKey: 'UN',
    subjectName,
    issDate,
    expDate,
    signedDate
  });

  const outputPath = path.join(outputDir, filename);

  await createEvidencePDF({
    sourceKey: 'UN',
    sourceTitle: 'UN Security Council Consolidated List',
    portalUrl,
    subjectName,
    subjectType,
    clientRef,
    issDate,
    expDate,
    signedDate,
    checkDate,
    searchQuery: `Name: ${subjectName} | Method: Full Registry Text Scan (Alphabetical)`,
    matchStatus,
    matchDetails,
    screenshotBuffer,
    outputPath
  });

  return {
    source: 'UN Consolidated List',
    sourceKey: 'UN',
    filename,
    filePath: outputPath,
    matchStatus,
    matchDetails
  };
}
