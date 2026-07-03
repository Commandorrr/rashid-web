const express = require('express');
const cors = require('cors');

const applicationsRouter = require('./routes/applications');
const authRouter = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.use('/api/applications', applicationsRouter);
app.use('/api/auth', authRouter);

app.get('/api/health', (req, res) => {
    res.json({ ok: true, service: 'rashid-server' });
});

app.listen(PORT, () => {
    console.log(`Rashid API listening on http://localhost:${PORT}`);
});
