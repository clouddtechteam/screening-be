import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { runGoogleAdverseMediaScreening } from '../services/googleScreening.js';
import { runOfacScreening } from '../services/ofacScreening.js';
import { runUnScreening } from '../services/unScreening.js';
import { runUaeScreening } from '../services/uaeScreening.js';
import { getDailyIndex, downloadAllSourcesDaily, downloadSourceList } from '../services/dailyDownloadService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EVIDENCE_BASE_DIR = path.resolve(__dirname, '../storage/evidence');
const CASES_FILE = path.resolve(__dirname, '../data/cases.json');

// Ensure base storage exists
if (!fs.existsSync(EVIDENCE_BASE_DIR)) fs.mkdirSync(EVIDENCE_BASE_DIR, { recursive: true });
const dataDir = path.dirname(CASES_FILE);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

function getStoredCases() {
  try {
    if (fs.existsSync(CASES_FILE)) {
      return JSON.parse(fs.readFileSync(CASES_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Error reading cases:', e);
  }
  return [];
}

function saveStoredCases(cases) {
  try {
    fs.writeFileSync(CASES_FILE, JSON.stringify(cases, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error saving cases:', e);
  }
}

/**
 * Executes full background check & generates 4 PDFs
 */
export async function startScreening(req, res) {
  try {
    const {
      subjectName,
      subjectType = 'Individual', // Individual or Entity
      clientAccountName = '',
      clientRef = '',
      selectedDateType = null,
      selectedDate = null,
      issDate = '',
      expDate = '',
      signedDate = '',
      checkDate = new Date().toISOString().split('T')[0],
      googleSearchQuery = '',
      customSearchQuery = '',
      forceRefreshLists = false
    } = req.body;

    if (!subjectName || !subjectName.trim()) {
      return res.status(400).json({ error: 'Subject Name (Individual or Entity) is required.' });
    }

    const resolvedAccountName = (clientAccountName || clientRef || '').trim();
    const effectiveQuery = (googleSearchQuery || customSearchQuery || '').trim();

    // Mutually exclusive single date selection logic
    let activeDateType = selectedDateType;
    let activeDateVal = selectedDate;

    if (!activeDateType) {
      if (issDate && issDate.toLowerCase() !== 'notset') {
        activeDateType = 'issDate';
        activeDateVal = issDate;
      } else if (expDate && expDate.toLowerCase() !== 'notset') {
        activeDateType = 'expDate';
        activeDateVal = expDate;
      } else if (signedDate && signedDate.toLowerCase() !== 'notset') {
        activeDateType = 'signedDate';
        activeDateVal = signedDate;
      }
    }

    // Keep the other two blank and excluded
    const activeIssDate = activeDateType === 'issDate' ? activeDateVal : '';
    const activeExpDate = activeDateType === 'expDate' ? activeDateVal : '';
    const activeSignedDate = activeDateType === 'signedDate' ? activeDateVal : '';

    const caseId = uuidv4();
    const caseDir = path.join(EVIDENCE_BASE_DIR, caseId);
    if (!fs.existsSync(caseDir)) fs.mkdirSync(caseDir, { recursive: true });

    // Step 2 & 3: Check official list versions & refresh if needed or requested
    const dailyIndex = getDailyIndex();
    const todayStr = new Date().toISOString().split('T')[0];
    const needsRefresh = forceRefreshLists || dailyIndex.lastCheckDate !== todayStr || !dailyIndex.sources?.UN;

    let sourceListStatus = dailyIndex.sources || {};
    if (needsRefresh) {
      console.log(`Refreshing official sanctions lists for ${todayStr}...`);
      sourceListStatus = await downloadAllSourcesDaily();
    }

    // Step 4: Run all four searches with isolation
    console.log(`Starting 4-source compliance screening for: ${subjectName} (Case: ${caseId})`);

    const commonParams = {
      subjectName: subjectName.trim(),
      subjectType,
      clientAccountName: resolvedAccountName,
      clientRef: resolvedAccountName,
      selectedDateType: activeDateType,
      selectedDate: activeDateVal,
      issDate: activeIssDate,
      expDate: activeExpDate,
      signedDate: activeSignedDate,
      checkDate,
      customSearchQuery: effectiveQuery,
      outputDir: caseDir
    };

    console.log('Running 1/4 Google Adverse Media...');
    const adverseMediaResult = await runGoogleAdverseMediaScreening(commonParams);

    console.log('Running 2/4 OFAC Sanctions Search...');
    const ofacResult = await runOfacScreening(commonParams);

    console.log('Running 3/4 UN Consolidated List...');
    const unResult = await runUnScreening(commonParams);

    console.log('Running 4/4 UAE IEC Sanctions List...');
    const uaeResult = await runUaeScreening(commonParams);

    const overallStatus = [adverseMediaResult, ofacResult, unResult, uaeResult].some(
      r => r.matchStatus === 'POTENTIAL_MATCH'
    ) ? 'FLAGGED_FOR_REVIEW' : 'PASSED_CLEARED';

    const caseRecord = {
      id: caseId,
      createdAt: new Date().toISOString(),
      subjectName: subjectName.trim(),
      subjectType,
      clientAccountName: resolvedAccountName,
      clientRef: resolvedAccountName,
      selectedDateType: activeDateType,
      selectedDate: activeDateVal,
      issDate: activeIssDate,
      expDate: activeExpDate,
      signedDate: activeSignedDate,
      checkDate,
      googleSearchQuery: effectiveQuery,
      overallStatus,
      sourceListVersions: sourceListStatus,
      files: [
        {
          key: 'ADVERSE_MEDIA',
          sourceName: 'Google Adverse Media',
          filename: adverseMediaResult.filename,
          matchStatus: adverseMediaResult.matchStatus,
          matchDetails: adverseMediaResult.matchDetails,
          filePath: adverseMediaResult.filePath
        },
        {
          key: 'OFAC',
          sourceName: 'OFAC Sanctions Search',
          filename: ofacResult.filename,
          matchStatus: ofacResult.matchStatus,
          matchDetails: ofacResult.matchDetails,
          filePath: ofacResult.filePath
        },
        {
          key: 'UN',
          sourceName: 'UN Consolidated List',
          filename: unResult.filename,
          matchStatus: unResult.matchStatus,
          matchDetails: unResult.matchDetails,
          filePath: unResult.filePath
        },
        {
          key: 'UAE',
          sourceName: 'UAE Local List (IEC)',
          filename: uaeResult.filename,
          matchStatus: uaeResult.matchStatus,
          matchDetails: uaeResult.matchDetails,
          filePath: uaeResult.filePath
        }
      ]
    };

    const cases = getStoredCases();
    cases.unshift(caseRecord);
    saveStoredCases(cases);

    return res.status(201).json({
      success: true,
      message: 'Screening completed and 4 evidence PDFs generated.',
      caseData: caseRecord
    });

  } catch (error) {
    console.error('Screening execution failure:', error);
    return res.status(500).json({ error: error.message || 'Screening failed' });
  }
}

export async function getAllCases(req, res) {
  const cases = getStoredCases();
  return res.json(cases);
}

export async function getCaseById(req, res) {
  const { id } = req.params;
  const cases = getStoredCases();
  const found = cases.find(c => c.id === id);
  if (!found) return res.status(404).json({ error: 'Case not found' });
  return res.json(found);
}

export async function downloadCasePdf(req, res) {
  const { id, filename } = req.params;
  const filePath = path.join(EVIDENCE_BASE_DIR, id, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Requested evidence file not found.' });
  }

  const isInline = req.query.inline === 'true' || req.query.view === 'true';
  const disposition = isInline ? 'inline' : 'attachment';

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
  return fs.createReadStream(filePath).pipe(res);
}

export async function viewCasePdf(req, res) {
  const { id, filename } = req.params;
  const filePath = path.join(EVIDENCE_BASE_DIR, id, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Requested evidence file not found.' });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  return fs.createReadStream(filePath).pipe(res);
}

export async function downloadCaseZip(req, res) {
  const { id } = req.params;
  const cases = getStoredCases();
  const found = cases.find(c => c.id === id);
  if (!found) return res.status(404).json({ error: 'Case not found' });

  const caseDir = path.join(EVIDENCE_BASE_DIR, id);
  if (!fs.existsSync(caseDir)) {
    return res.status(404).json({ error: 'Evidence directory not found.' });
  }

  const zipFilename = `Compliance_Evidence_${found.subjectName.replace(/\s+/g, '_')}_${found.checkDate}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(res);

  // Append all files in caseDir
  for (const fileObj of found.files) {
    const fullPath = path.join(caseDir, fileObj.filename);
    if (fs.existsSync(fullPath)) {
      archive.file(fullPath, { name: fileObj.filename });
    }
  }

  // Also add an audit manifest JSON into the ZIP
  archive.append(JSON.stringify(found, null, 2), { name: 'Audit_Manifest.json' });

  await archive.finalize();
}

export async function getSourceListsStatus(req, res) {
  const index = getDailyIndex();
  return res.json(index);
}

export async function refreshSourceLists(req, res) {
  try {
    const results = await downloadAllSourcesDaily();
    return res.json({
      success: true,
      message: 'Official source lists updated successfully.',
      sources: results
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
