import express from 'express' ;
import { MongoClient } from 'mongodb';
import 'dotenv/config';
import cors from "cors";

const app = express()
const PORT = 5000;

app.use(express.json());
app.use(cors());



const client = new MongoClient(process.env.MONGODB_URI);

let eventsCollection;

export async function connectToMongoDB() {
  try {
    await client.connect();

    const database = client.db("uddokta-bd");
    eventsCollection = database.collection("events");

    console.log("You successfully connected to MongoDB!");
    console.log("Events collection is ready!");

    return client;
  } catch (err) {
    console.dir(err);
  }
}

connectToMongoDB()


app.get('/' , (req, res) => {
    res.send({message:`server is running`})
})

app.post("/events", async (req, res) => {
  try {
    const eventData = req.body;

    const result = await eventsCollection.insertOne({
      ...eventData,
      eventDate: new Date(eventData.eventDate),
      createdAt: new Date(),
    });

    res.status(201).send({
      success: true,
      message: "Event created successfully",
      insertedId: result.insertedId,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to create event",
    });
  }
});

app.get("/events", async (req, res) => {
  try {
    const events = await eventsCollection.find().toArray();

    res.send(events);
  } catch (error) {
    res.send({
      success: false,
      message: "Failed to get events",
    });
  }
});

app.listen(PORT, () => {
    console.log(`server is running in ${PORT}`)
})