import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import screeningRoutes from './routes/screeningRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());

// API routes
app.use('/api', screeningRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'HEALTHY',
    service: 'Compliance Screening & Due Diligence API',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(` Compliance Screening Backend Server running on port ${PORT}`);
  console.log(` Health endpoint: http://localhost:${PORT}/api/health`);
  console.log(`====================================================`);
});
