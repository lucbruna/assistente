import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import morgan from 'morgan';
import { aiRouter } from './routes/ai.js';
import { authRouter } from './routes/auth.js';
import { ocrRouter } from './routes/ocr.js';
import { storageRouter } from './routes/storage.js';

dotenv.config();

const app = express();

app.use(helmet());
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(morgan('combined'));

app.use('/api/ai', aiRouter);
app.use('/api/auth', authRouter);
app.use('/api/ocr', ocrRouter);
app.use('/api/storage', storageRouter);

app.use(express.static('../'));

app.get('/health', (req, res) => res.json({ status: 'ok', version: '4.0' }));

app.get('*', (req, res) => {
  res.sendFile('index.html', { root: '../' });
});

export default app;
