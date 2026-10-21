import express from 'express';
import {
  startScreening,
  getAllCases,
  getCaseById,
  downloadCasePdf,
  downloadCaseZip,
  getSourceListsStatus,
  refreshSourceLists
} from '../controllers/screeningController.js';

const router = express.Router();

// Screening cases
router.post('/screenings/start', startScreening);
router.get('/screenings', getAllCases);
router.get('/screenings/:id', getCaseById);
router.get('/screenings/:id/download/:filename', downloadCasePdf);
router.get('/screenings/:id/download-zip', downloadCaseZip);

// Official source lists
router.get('/source-lists/status', getSourceListsStatus);
router.post('/source-lists/refresh', refreshSourceLists);

export default router;
