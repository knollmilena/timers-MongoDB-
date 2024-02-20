import "dotenv/config";
import express from "express";
import nunjucks from "nunjucks";
import cookieParser from "cookie-parser";
import { nanoid } from "nanoid";
import argon from "argon2";
import { auth } from "./src/auth/auth.mjs";
import { timersRouter } from "./src/actions/timers.mjs";
import { authRouter } from "./src/auth/auth.mjs";
import { default as mongodb } from "mongodb";

const app = express();

const MongoClient = mongodb.MongoClient;
const ObjectId = mongodb.ObjectId;
const clientPromise = MongoClient.connect(process.env.DB_URL, (err, database) => {
  if (err) {
    return console.log(err);
  }
  db = database;
  db = client.db("users");
});

nunjucks.configure("views", {
  autoescape: true,
  express: app,
  tags: {
    blockStart: "[%",
    blockEnd: "%]",
    variableStart: "[[",
    variableEnd: "]]",
    commentStart: "[#",
    commentEnd: "#]",
  },
});

app.set("view engine", "njk");
app.use(cookieParser());
app.use(express.json());
app.use(express.static("public"));
app.use(async (req, res, next) => {
  try {
    const client = await clientPromise;
    req.db = client.db("users");
    next();
  } catch (err) {
    next(err);
  }
});

app.use("/api", timersRouter);
app.use("/", authRouter);
app.get("/", auth(), (req, res) => {
  res.render("index", {
    user: req.user,
    authError: req.query.authError === "true",
  });
});

async function createUser(db, username, password) {
  const id = new ObjectId();
  password = await argon.hash(password, { hashLength: 60 });
  await db.collection("users").insertOne({ _id: new ObjectId(id), username, password });
  return id;
}

async function findUserByUsername(db, username) {
  return db.collection("users").findOne({ username });
}

async function findUserBySessionId(db, sessionId) {
  // const id = ObjectId(session.userId);
  const session = await db.collection("sessions").findOne(
    { sessionId },
    {
      projection: { userId: 1 },
    }
  );

  if (!session) {
    return;
  }
  return db.collection("users").findOne({ _id: new ObjectId(session.userId) });
}
async function createSession(db, userId) {
  const sessionId = nanoid();

  await db.collection("sessions").insertOne({
    userId,
    sessionId,
  });

  return sessionId;
}

async function deleteSession(db, sessionId) {
  await db.collection("sessions").deleteOne({ sessionId });
}
async function loginAccount(db, res, id) {
  const sessionId = await createSession(db, id);
  res.cookie("sessionId", sessionId, { httpOnly: true }).redirect("/");
}

function createInterval(timers) {
  for (let i = 0; i < timers.length; i++) {
    timers[i].progress = Date.now() - timers[i].start;
  }
  return timers;
}

const port = process.env.PORT || 3001;

app.listen(port, () => {
  console.log(`  Listening on http://localhost:${port}`);
});

export {
  createUser,
  findUserByUsername,
  findUserBySessionId,
  createSession,
  deleteSession,
  loginAccount,
  createInterval,
  ObjectId,
};
