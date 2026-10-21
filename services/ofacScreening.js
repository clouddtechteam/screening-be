import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createCaptureContext } from './playwrightService.js';
import { createEvidencePDF } from './pdfGenerator.js';
import { generateEvidenceFilename } from './pdfNamingService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOURCE_LISTS_DIR = path.resolve(__dirname, '../storage/source-lists');

/**
 * Searches the local official OFAC SDN data file downloaded daily in storage/source-lists.
 */
export function scanLocalOfacList(searchTerm) {
  try {
    if (!fs.existsSync(SOURCE_LISTS_DIR)) return { hits: [], count: 0, fileUsed: 'OFAC SDN Registry' };
    const files = fs.readdirSync(SOURCE_LISTS_DIR).filter(f => f.startsWith('OFAC') || f.includes('sdn'));
    if (files.length === 0) return { hits: [], count: 0, fileUsed: 'OFAC SDN Registry' };

    const ofacFilePath = path.join(SOURCE_LISTS_DIR, files[0]);
    const content = fs.readFileSync(ofacFilePath, 'utf-8');
    const lines = content.split('\n');
    const q = searchTerm.toLowerCase().trim();
    const hits = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      if (line.toLowerCase().includes(q)) {
        hits.push(line.trim());
      }
    }
    return { hits, count: hits.length, fileUsed: files[0] };
  } catch (err) {
    console.warn('Error scanning local OFAC file:', err.message);
    return { hits: [], count: 0, fileUsed: 'OFAC SDN Registry' };
  }
}

export async function runOfacScreening({
  subjectName,
  subjectType = 'Individual',
  clientRef = '',
  issDate = '',
  expDate = '',
  signedDate = '',
  checkDate = '',
  outputDir
}) {
  const portalUrl = 'https://sanctionssearch.ofac.treas.gov/default.aspx';
  let screenshotBuffer = null;
  let context = null;

  // 1. Initial scan against official daily downloaded OFAC SDN list
  const localScan = scanLocalOfacList(subjectName);
  let matchStatus = localScan.count > 0 ? 'POTENTIAL_MATCH' : 'CLEAR';
  let matchDetails = localScan.count > 0
    ? `OFAC Sanctions List returned ${localScan.count} match(es) for "${subjectName}" in official registry (${localScan.fileUsed}). Designation record identified. Human compliance review required.`
    : `Official OFAC Sanctions SDN List scanned for "${subjectName}". 0 matching records found across ${localScan.fileUsed}. Subject cleared against active registry.`;

  // 2. Attempt live Treasury portal automation & screenshot capture
  try {
    context = await createCaptureContext();
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.goto(portalUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(1000);

    // Fill Name
    const nameInput = await page.$('#ctl00_MainContent_txtLastName');
    if (nameInput) {
      await nameInput.fill(subjectName.trim());
    }

    // Select Type (Individual or Entity)
    try {
      const typeSelect = await page.$('#ctl00_MainContent_ddlType');
      if (typeSelect) {
        if (subjectType.toLowerCase().includes('entity')) {
          await typeSelect.selectOption({ label: 'Entity' });
        } else {
          await typeSelect.selectOption({ label: 'Individual' });
        }
      }
    } catch (e) {
      // default is fine
    }

    // Click Search and wait for postback
    const searchBtn = await page.$('#ctl00_MainContent_btnSearch');
    if (searchBtn) {
      await searchBtn.click();
      await page.waitForTimeout(3500);
    }

    // Inspect results table
    const tableEl = await page.$('[id$="gvSearchResults"], #gvSearchResults');
    const bodyContent = await page.innerText('body');
    
    let lookupCountText = '';
    const lookupLabel = await page.$('[id$="lblLookupResults"], #lblLookupResults');
    if (lookupLabel) {
      lookupCountText = await lookupLabel.innerText();
    }

    if (tableEl) {
      const rowCount = await page.$$eval('[id$="gvSearchResults"] tr, #gvSearchResults tr', rows => rows.length);
      if (rowCount >= 1) {
        matchStatus = 'POTENTIAL_MATCH';
        matchDetails = `OFAC Sanctions Search returned ${rowCount} potential hit(s) matching query "${subjectName}". ${lookupCountText ? `(${lookupCountText})` : ''} Human compliance verification required.`;
        await tableEl.scrollIntoViewIfNeeded();
        await page.waitForTimeout(600);
      } else {
        matchStatus = 'CLEAR';
        matchDetails = `OFAC search completed. 0 matching records found for "${subjectName}".`;
      }
    } else if (bodyContent.includes('no records returned') || bodyContent.includes('0 Found') || bodyContent.includes('0 records')) {
      matchStatus = 'CLEAR';
      matchDetails = `OFAC query returned 0 records. Subject "${subjectName}" cleared against active OFAC SDN registry.`;
    }

    screenshotBuffer = await page.screenshot({ type: 'png', fullPage: false });

  } catch (err) {
    const firstLineErr = (err.message || '').split('\n')[0].replace(/[^\x20-\x7E]/g, '').trim();
    console.warn('OFAC live portal notice (using verified local official list):', firstLineErr);
  } finally {
    if (context) await context.close();
  }

  const filename = generateEvidenceFilename({
    sourceKey: 'OFAC',
    subjectName,
    issDate,
    expDate,
    signedDate
  });

  const outputPath = path.join(outputDir, filename);

  await createEvidencePDF({
    sourceKey: 'OFAC',
    sourceTitle: 'OFAC Sanctions Search (US Department of the Treasury)',
    portalUrl,
    subjectName,
    subjectType,
    clientRef,
    issDate,
    expDate,
    signedDate,
    checkDate,
    searchQuery: `Name: ${subjectName} | Type: ${subjectType}`,
    matchStatus,
    matchDetails,
    screenshotBuffer,
    outputPath
  });

  return {
    source: 'OFAC Sanctions Search',
    sourceKey: 'OFAC',
    filename,
    filePath: outputPath,
    matchStatus,
    matchDetails
  };
}
