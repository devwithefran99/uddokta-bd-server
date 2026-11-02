
import express from 'express';
import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';
import cors from "cors";

const app = express();
const PORT = 5000;

app.use(express.json());
app.use(cors());

const client = new MongoClient(process.env.MONGODB_URI);

let eventsCollection;
let joinedEventsCollection;

export async function connectToMongoDB() {
  try {
    await client.connect();

    const database = client.db("uddokta-bd");
    eventsCollection = database.collection("events");
    joinedEventsCollection = database.collection("joinedEvents");

    console.log("You successfully connected to MongoDB!");
    console.log("Events collection is ready!");
    console.log("Joined Events collection is ready!");

    return client;
  } catch (err) {
    console.dir(err);
  }
}

connectToMongoDB();

app.get('/', (req, res) => {
  res.send({ message: `server is running` });
});

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

// Join Event API
app.post("/join-event", async (req, res) => {
  try {
    const joinData = req.body;

    const alreadyJoined = await joinedEventsCollection.findOne({
      eventId: joinData.eventId,
      userEmail: joinData.userEmail,
    });

    if (alreadyJoined) {
      return res.send({
        success: false,
        message: "You have already joined this event!",
      });
    }

    const result = await joinedEventsCollection.insertOne({
      ...joinData,
      joinedAt: new Date(),
    });

    res.status(201).send({
      success: true,
      message: "Successfully joined the event!",
      insertedId: result.insertedId,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to join event",
    });
  }
});

app.patch("/events/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const eventData = req.body;

    const result = await eventsCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          ...eventData,
          eventDate: new Date(eventData.eventDate),
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({
        success: false,
        message: "Event not found",
      });
    }

    res.send({
      success: true,
      message: "Event updated successfully",
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to update event",
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

app.get("/upcoming-events", async (req, res) => {
  const result = await eventsCollection
    .find({
      eventDate: { $gte: new Date() },
    })
    .sort({ eventDate: 1 })
    .limit(6)
    .toArray();

  res.send(result);
});

app.get("/events/:id", async (req, res) => {
  const { id } = req.params;

  const result = await eventsCollection.findOne({
    _id: new ObjectId(id),
  });

  res.send(result);
});

app.get("/joined-events", async (req, res) => {
  const email = req.query.email;

  const result = await joinedEventsCollection
    .find({ userEmail: email })
    .toArray();

  res.send(result);
});

app.delete("/events/:id", async (req, res) => {
  const { id } = req.params;

  const result = await eventsCollection.deleteOne({
    _id: new ObjectId(id),
  });

  res.json(result);
});

app.listen(PORT, () => {
  console.log(`server is running in ${PORT}`);
});
