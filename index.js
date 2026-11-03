
import express from 'express';
import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';
import cors from "cors";
import { jwtVerify, createRemoteJWKSet } from "jose";

const app = express();
const PORT = 5000;

app.use(express.json());
app.use(cors());

const client = new MongoClient(process.env.MONGODB_URI);

let eventsCollection;
let joinedEventsCollection;

// JWT Verification Setup
const authURL = process.env.BETTER_AUTH_URL;

const JWKS = createRemoteJWKSet(
  new URL(`${authURL}/api/auth/jwks`)
);

const verifyApi = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).send({
        message: "Unauthorized access. Token required!",
      });
    }

    const token = authHeader.split(" ")[1];

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: authURL,
      audience: authURL,
    });

    req.user = payload;

    if (!req.user.email) {
      return res.status(401).send({
        message: "Invalid user token",
      });
    }

    next();

  } catch (error) {
    console.log("JWT Verification Error:", error.message);

    return res.status(401).send({
      message: "Invalid or expired token",
    });
  }
};

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

// Create Event - Protected
app.post("/events", verifyApi, async (req, res) => {
  try {
    const eventData = req.body;

    const result = await eventsCollection.insertOne({
      title: eventData.title,
      description: eventData.description,
      eventType: eventData.eventType,
      thumbnail: eventData.thumbnail,
      location: eventData.location,
      eventDate: new Date(eventData.eventDate),
      creatorEmail: req.user.email,
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

// Join Event - Protected
app.post("/join-event", verifyApi, async (req, res) => {
  try {
    const joinData = req.body;

    if (!ObjectId.isValid(joinData.eventId)) {
      return res.status(400).send({
        success: false,
        message: "Invalid event ID",
      });
    }

    const event = await eventsCollection.findOne({
      _id: new ObjectId(joinData.eventId),
    });

    if (!event) {
      return res.status(404).send({
        success: false,
        message: "Event not found",
      });
    }

    const alreadyJoined = await joinedEventsCollection.findOne({
      eventId: joinData.eventId,
      userEmail: req.user.email,
    });

    if (alreadyJoined) {
      return res.send({
        success: false,
        message: "You have already joined this event!",
      });
    }

    const result = await joinedEventsCollection.insertOne({
      eventId: event._id.toString(),
      eventTitle: event.title,
      eventImage: event.thumbnail,
      eventDate: event.eventDate,
      location: event.location,
      userEmail: req.user.email,
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

// Update Event - Protected + Owner Verification
app.patch("/events/:id", verifyApi, async (req, res) => {
  try {
    const { id } = req.params;
    const eventData = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        success: false,
        message: "Invalid event ID",
      });
    }

    const result = await eventsCollection.updateOne(
      {
        _id: new ObjectId(id),
        creatorEmail: req.user.email,
      },
      {
        $set: {
          title: eventData.title,
          description: eventData.description,
          eventType: eventData.eventType,
          thumbnail: eventData.thumbnail,
          location: eventData.location,
          eventDate: new Date(eventData.eventDate),
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({
        success: false,
        message: "Event not found or you are not the owner",
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

// Get All Events - Public
app.get("/events", async (req, res) => {
  try {
    const events = await eventsCollection.find().toArray();

    res.send(events);
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to get events",
    });
  }
});

// Upcoming Events - Public
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

// Single Event Details - Public
app.get("/events/:id", async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({
      message: "Invalid event ID",
    });
  }

  const result = await eventsCollection.findOne({
    _id: new ObjectId(id),
  });

  if (!result) {
    return res.status(404).send({
      message: "Event not found",
    });
  }

  res.send(result);
});

// My Events - Protected
app.get("/my-events", verifyApi, async (req, res) => {
  const result = await eventsCollection
    .find({ creatorEmail: req.user.email })
    .toArray();

  res.send(result);
});

// Joined Events - Protected
app.get("/joined-events", verifyApi, async (req, res) => {
  const result = await joinedEventsCollection
    .find({ userEmail: req.user.email })
    .sort({ eventDate: 1 })
    .toArray();

  res.send(result);
});

// Delete Event - Protected + Owner Verification
app.delete("/events/:id", verifyApi, async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({
      success: false,
      message: "Invalid event ID",
    });
  }

  const result = await eventsCollection.deleteOne({
    _id: new ObjectId(id),
    creatorEmail: req.user.email,
  });

  if (result.deletedCount === 0) {
    return res.status(404).send({
      success: false,
      message: "Event not found or you are not the owner",
    });
  }

  res.send({
    success: true,
    message: "Event deleted successfully",
  });
});

app.listen(PORT, () => {
  console.log(`server is running in ${PORT}`);
});
