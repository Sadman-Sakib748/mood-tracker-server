require('dotenv').config();
const express = require('express');
const app = express();
const cors = require('cors');
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qam3y.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

// Connect to DB and set up routes
async function connectDB() {
    try {
        // Connect MongoDB client
        await client.connect();
        console.log('MongoDB connected');

        const moodsCollection = client.db("mood").collection("api");

        app.get("/api/moods", async (req, res) => {
            const { userId } = req.query;
            if (!userId) return res.status(400).json({ error: "Missing userId query parameter" });

            try {
                const moods = await moodsCollection
                    .find({ userId, deleted: false })
                    .sort({ date: -1 })
                    .toArray();
                res.json(moods);
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
        app.get("/api/moods/:id", async (req, res) => {
            const { id } = req.params;

            try {
                const mood = await moodsCollection.findOne({ _id: new ObjectId(id), deleted: false });
                if (!mood) return res.status(404).json({ error: "Mood not found" });
                res.json(mood);
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });


        // POST new mood
        app.post("/api/moods", async (req, res) => {
            const { userId, mood, note, date, deleted } = req.body;

            if (!userId || !mood || !date) {
                return res.status(400).json({ error: "Missing required fields: userId, mood or date" });
            }

            try {
                // Check 1: একই দিনে কি mood আছে?
                const existingMoodToday = await moodsCollection.findOne({ userId, date });
                if (existingMoodToday) {
                    return res.status(409).json({ error: "Mood already logged for this date" });
                }

                // Check 2: মাসে কতবার mood পোস্ট করেছে?
                // তারিখ থেকে মাসের প্রথম দিন বের করি
                const startOfMonth = new Date(date);
                startOfMonth.setDate(1);
                startOfMonth.setHours(0, 0, 0, 0);

                // মাসের শেষ দিন
                const endOfMonth = new Date(startOfMonth);
                endOfMonth.setMonth(endOfMonth.getMonth() + 1);

                // MongoDB এ ISODate হিসেবে query দেওয়া লাগবে, তাই date স্ট্রিং থেকে Date এ রূপান্তর করো
                const moodsThisMonthCount = await moodsCollection.countDocuments({
                    userId,
                    date: {
                        $gte: startOfMonth.toISOString().slice(0, 10),
                        $lt: endOfMonth.toISOString().slice(0, 10),
                    },
                });

                if (moodsThisMonthCount >= 1) {
                    return res.status(429).json({ error: "You can post mood only once per month" });
                }

                // এখন নতুন মুড যোগ করো
                const newMood = { userId, mood, note: note || "", date, deleted: deleted || false };
                const result = await moodsCollection.insertOne(newMood);
                res.status(201).json({ ...newMood, _id: result.insertedId });
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });


        // DELETE mood (soft delete)
        app.delete("/api/moods/:id", async (req, res) => {
            const { id } = req.params;
            try {
                const result = await moodsCollection.deleteOne(
                    { _id: new ObjectId(id) },
                    { $set: { deleted: true } }
                );
                if (result.matchedCount === 0) return res.status(404).json({ error: "Mood not found" });
                res.json({ message: "Mood deleted" });
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });

        // PATCH restore mood (undo delete)
        app.put("/api/moods/:id", async (req, res) => {
            const { id } = req.params;
            const { mood, note, date, deleted } = req.body;

            if (!mood || !date) {
                return res.status(400).json({ error: "Mood and date are required" });
            }

            try {
                const result = await moodsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { mood, note: note || "", date, deleted: deleted || false } }
                );

                if (result.matchedCount === 0)
                    return res.status(404).json({ error: "Mood not found" });

                res.json({ message: "Mood updated successfully" });
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });



    } catch (error) {
        console.error("Error connecting to DB or setting up routes:", error);
    }
}

// Call the async function to connect to DB and setup routes
connectDB();

// Simple health check route
app.get('/', (req, res) => {
    res.send('Hello World!');
});

// Start server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
