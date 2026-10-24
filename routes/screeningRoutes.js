import express from 'express';
import {
  startScreening,
  getAllCases,
  getCaseById,
  downloadCasePdf,
  viewCasePdf,
  downloadCaseZip,
  getSourceListsStatus,
  refreshSourceLists,
  deleteCase
} from '../controllers/screeningController.js';

const router = express.Router();

// Screening cases
router.post('/screenings/start', startScreening);
router.get('/screenings', getAllCases);
router.get('/screenings/:id', getCaseById);
router.delete('/screenings/:id', deleteCase);
router.get('/screenings/:id/view/:filename', viewCasePdf);
router.get('/screenings/:id/download/:filename', downloadCasePdf);
router.get('/screenings/:id/download-zip', downloadCaseZip);

// Official source lists
router.get('/source-lists/status', getSourceListsStatus);
router.post('/source-lists/refresh', refreshSourceLists);

export default router;
