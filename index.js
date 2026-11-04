
import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";
import cors from "cors";
import { jwtVerify, createRemoteJWKSet } from "jose";

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// MongoDB Connection
const client = new MongoClient(process.env.MONGODB_URI);

const authURL = process.env.BETTER_AUTH_URL;

const JWKS = createRemoteJWKSet(
  new URL(`${authURL}/api/auth/jwks`)
);

// JWT Verification
const verifyApi = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).send({
        message: "Unauthorized access",
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
    console.log("JWT Error:", error.message);

    res.status(401).send({
      message: "Invalid or expired token",
    });
  }
};


let eventsCollection;
let joinedEventsCollection;

// Create Event - Protected
app.post("/events", verifyApi, async (req, res) => {
  const data = req.body;

  const result = await eventsCollection.insertOne({
    ...data,
    creatorEmail: req.user.email,
    eventDate: new Date(data.eventDate),
    createdAt: new Date(),
  });

  res.send({
    success: true,
    message: "Event created successfully",
    insertedId: result.insertedId,
  });
});


app.get("/events", async (req, res) => {
  const result = await eventsCollection.find().toArray();
  res.send(result);
});


app.get("/upcoming-events", async (req, res) => {
  const result = await eventsCollection
    .find({ eventDate: { $gte: new Date() } })
    .sort({ eventDate: 1 })
    .limit(6)
    .toArray();

  res.send(result);
});


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

  res.send(result);
});

// Join Event - Protected
app.post("/join-event", verifyApi, async (req, res) => {
  const { eventId } = req.body;

  if (!ObjectId.isValid(eventId)) {
    return res.status(400).send({
      success: false,
      message: "Invalid event ID",
    });
  }

  const event = await eventsCollection.findOne({
    _id: new ObjectId(eventId),
  });

  if (!event) {
    return res.status(404).send({
      success: false,
      message: "Event not found",
    });
  }

  const alreadyJoined = await joinedEventsCollection.findOne({
    eventId: eventId,
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

  res.send({
    success: true,
    message: "Successfully joined the event!",
    insertedId: result.insertedId,
  });
});


app.get("/my-events", verifyApi, async (req, res) => {
  const result = await eventsCollection
    .find({ creatorEmail: req.user.email })
    .toArray();

  res.send(result);
});


app.get("/joined-events", verifyApi, async (req, res) => {
  const result = await joinedEventsCollection
    .find({ userEmail: req.user.email })
    .sort({ eventDate: 1 })
    .toArray();

  res.send(result);
});


app.patch("/events/:id", verifyApi, async (req, res) => {
  const { id } = req.params;
  const data = req.body;

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({
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
        ...data,
        eventDate: new Date(data.eventDate),
        updatedAt: new Date(),
      },
    }
  );

  if (result.matchedCount === 0) {
    return res.status(404).send({
      message: "Event not found or you are not the owner",
    });
  }

  res.send({
    success: true,
    message: "Event updated successfully",
  });
});


app.delete("/events/:id", verifyApi, async (req, res) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({
      message: "Invalid event ID",
    });
  }

  const result = await eventsCollection.deleteOne({
    _id: new ObjectId(id),
    creatorEmail: req.user.email,
  });

  if (result.deletedCount === 0) {
    return res.status(404).send({
      message: "Event not found or you are not the owner",
    });
  }

  res.send({
    success: true,
    message: "Event deleted successfully",
  });
});


app.get("/", (req, res) => {
  res.send({ message: "server is running" });
});


async function startServer() {
  try {
    await client.connect();

    const db = client.db("uddokta-bd");

    eventsCollection = db.collection("events");
    joinedEventsCollection = db.collection("joinedEvents");

    console.log("You successfully connected to MongoDB!");

    app.listen(PORT, () => {
      console.log(`Server is running at ${PORT}`);
    });

  } catch (error) {
    console.log("MongoDB Connection Error:", error);
  }
}

startServer();


export default app;