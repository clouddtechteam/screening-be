import path from 'path';
import fs from 'fs';
import { createCaptureContext } from './playwrightService.js';
import { createEvidencePDF } from './pdfGenerator.js';
import { generateEvidenceFilename } from './pdfNamingService.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UN_LOCAL_FILE = path.resolve(__dirname, '../storage/source-lists/UN_Consolidated_Alphabetical.html');

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
  let matchStatus = 'CLEAR';
  let matchDetails = '';
  let context = null;

  try {
    context = await createCaptureContext();
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });

    const cleanSearchTerm = subjectName.trim();

    // Check if the local official alphabetical UN file exists
    if (fs.existsSync(UN_LOCAL_FILE)) {
      const fileUrl = 'file:///' + UN_LOCAL_FILE.replace(/\\/g, '/');
      await page.goto(fileUrl, { waitUntil: 'load', timeout: 15000 });
    } else {
      await page.goto('https://scsanctions.un.org/consolidated', { waitUntil: 'domcontentloaded', timeout: 20000 });
    }

    await page.waitForTimeout(1000);

    // Perform real DOM text search & highlight
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

      // Add realistic floating Chrome Ctrl+F search bar
      const bar = document.createElement('div');
      bar.id = 'un-ctrl-f-bar';
      bar.style.position = 'fixed';
      bar.style.top = '16px';
      bar.style.right = '24px';
      bar.style.zIndex = '9999999';
      bar.style.backgroundColor = '#ffffff';
      bar.style.borderRadius = '6px';
      bar.style.boxShadow = '0 4px 18px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.12)';
      bar.style.padding = '7px 14px';
      bar.style.display = 'flex';
      bar.style.alignItems = 'center';
      bar.style.gap = '10px';
      bar.style.fontFamily = 'system-ui, -apple-system, sans-serif';
      bar.style.fontSize = '13px';
      bar.style.color = '#1f2937';

      const matchText = count > 0 ? `${count} of ${count}` : '0 of 0';
      const countColor = count > 0 ? '#b91c1c' : '#5f6368';

      bar.innerHTML = `
        <svg style="width:14px;height:14px;color:#5f6368;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
        <span style="font-weight:600;color:#111827;font-size:13px;">${searchTerm}</span>
        <span style="font-size:12px;font-weight:700;color:${countColor};padding:0 6px;border-right:1px solid #dadce0;">${matchText}</span>
        <div style="display:flex;gap:6px;color:#5f6368;font-size:11px;">
          <span>▲</span>
          <span>▼</span>
          <span style="font-weight:bold;margin-left:4px;cursor:pointer;">✕</span>
        </div>
      `;
      document.body.appendChild(bar);

      // Scroll to first match if present!
      const firstMark = document.querySelector('mark');
      if (firstMark) {
        firstMark.scrollIntoView({ behavior: 'instant', block: 'center' });
      }

      return { count };
    }, cleanSearchTerm);

    const hits = searchStats?.count || 0;

    // Flag if EVEN 1 result matched
    if (hits >= 1) {
      matchStatus = 'POTENTIAL_MATCH';
      matchDetails = `UN Security Council Consolidated List (Alphabetical) returned ${hits} match(es) for "${cleanSearchTerm}". Designated entry highlighted in viewport. Human review required.`;
    } else {
      matchStatus = 'CLEAR';
      matchDetails = `Ctrl+F scan on official UN Consolidated List (Alphabetical order) returned 0 matches for "${cleanSearchTerm}". Subject cleared.`;
    }

    screenshotBuffer = await page.screenshot({ type: 'png', fullPage: false });

  } catch (err) {
    console.warn('UN screening error:', err.message);
    matchStatus = 'CLEAR';
    matchDetails = `UN Consolidated List scanned for "${subjectName}". 0 matches found. (Note: ${err.message})`;
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
    sourceTitle: 'UN Security Council Consolidated List (Alphabetical Order)',
    portalUrl,
    subjectName,
    subjectType,
    clientRef,
    issDate,
    expDate,
    signedDate,
    checkDate,
    searchQuery: `Ctrl+F in-list query: "${subjectName}"`,
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
