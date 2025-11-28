import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';


dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;


app.use(cors());
app.use(express.json());


app.get('/api/health', (req: Request, res: Response) => {
    res.json({ 
        status: 'ok', 
        message: 'Artist Location Map API is running',
        timestamp: new Date().toISOString()
    });
});


app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});