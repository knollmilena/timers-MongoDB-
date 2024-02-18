require("dotenv").config();

const express = require("express");
const nunjucks = require("nunjucks");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const { nanoid } = require("nanoid");
const argon = require("argon2");
const app = express();

const { MongoClient, ObjectId } = require("mongodb");

const clientPromise = MongoClient.connect(process.env.DB_URL, {
  userUnifiedTopology: true,
  poolSize: 10,
});

const router = express.Router();

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

const auth = () => async (req, res, next) => {
  if (!req.cookies["sessionId"]) {
    return next();
  }
  const user = await findUserBySessionId(req.db, req.cookies["sessionId"]);
  req.user = user;
  req.sessionId = req.cookies["sessionId"];
  next();
};

app.get("/", auth(), (req, res) => {
  res.render("index", {
    user: req.user,
    authError: req.query.authError === "true",
  });
});

const createUser = async (db, username, password) => {
  const id = ObjectId();
  password = await argon.hash(password, { hashLength: 60 });
  await db.collection("users").insertOne({ _id: ObjectId(id), username, password });
  return id;
};

const findUserByUsername = async (db, username) => db.collection("users").findOne({ username });

const findUserBySessionId = async (db, sessionId) => {
  const session = await db.collection("sessions").findOne(
    { sessionId },
    {
      projection: { userId: 1 },
    }
  );

  if (!session) {
    return;
  }
  return db.collection("users").findOne({ _id: ObjectId(session.userId) });
};

const createSession = async (db, userId) => {
  const sessionId = nanoid();

  await db.collection("sessions").insertOne({
    userId,
    sessionId,
  });

  return sessionId;
};

async function deleteSession(db, sessionId) {
  await db.collection("sessions").deleteOne({ sessionId });
}
async function loginAccount(db, res, id) {
  const sessionId = await createSession(db, id);
  res.cookie("sessionId", sessionId, { httpOnly: true }).redirect("/");
}
app.post("/login", bodyParser.urlencoded({ extended: false }), async (req, res) => {
  const { username, password } = req.body;
  const user = await findUserByUsername(req.db, username);
  const checkPass = await argon.verify(user.password, password);

  if (!user || !checkPass) {
    return res.redirect("/?authError=true");
  }
  loginAccount(req.db, res, user._id);
});

app.post("/signup", bodyParser.urlencoded({ extended: false }), async (req, res) => {
  const { username, password } = req.body;
  const user = await findUserByUsername(req.db, username);

  if (user) {
    const checkPass = await argon.verify(user.password, password);

    if (checkPass) {
      console.log("Такой пользователь уже существует");
      const sessionId = await createSession(req.db, user._id);
      res.cookie("sessionId", sessionId, { httpOnly: true }).redirect("/");
    } else {
      return res.redirect("/?authError=true");
    }
  } else {
    const idUser = await createUser(req.db, username, password);
    loginAccount(req.db, res, idUser);
  }
});

app.get("/logout", auth(), async (req, res) => {
  if (!req.user) {
    return res.redirect("/");
  }
  await deleteSession(req.db, req.sessionId);
  res.clearCookie("sessionId").redirect("/");
});

function createInterval(timers) {
  for (let i = 0; i < timers.length; i++) {
    timers[i].progress = Date.now() - timers[i].start;
  }
  return timers;
}

app.get("/api/timers", auth(), async (req, res) => {
  let data = await req.db.collection("timers").find({}).toArray();
  data = createInterval(data);

  if (req.query.isActive === "true" && req.user) {
    data = data.filter((u) => u.isActive === true && JSON.stringify(u.user_id) === JSON.stringify(req.user._id));
    res.json(data);
  } else {
    data = data.filter((u) => u.isActive === false && JSON.stringify(u.user_id) === JSON.stringify(req.user._id));
    res.json(data);
  }
});

app.post("/api/timers", auth(), async (req, res) => {
  const timer = {
    user_id: req.user._id,
    start: Date.now(),
    description: `${req.body.description}`,
    isActive: true,
    progress: 0,
  };
  await req.db.collection("timers").insertOne(timer);
  res.json(timer);
});

app.post("/api/timers/:id/stop", async (req, res) => {
  const d = new Date();
  const timer = await req.db.collection("timers").findOne({ _id: ObjectId(`${req.params.id}`) });
  const timer2 = await req.db
    .collection("timers")
    .updateOne(
      { _id: ObjectId(`${req.params.id}`) },
      { $set: { duration: Date.now() - timer.start, end: Date.now(), isActive: false } }
    );
  res.json(timer2);
});

const port = process.env.PORT || 3001;

app.listen(port, () => {
  console.log(`  Listening on http://localhost:${port}`);
});
