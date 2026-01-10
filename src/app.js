import express from 'express';
import cors from 'cors';
import routes from './routes/v1/index.js';

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Routes
app.use('/v1', routes);

// Home route
app.get('/', (req, res) => {
  res.send('API is running');
});

export default app;
