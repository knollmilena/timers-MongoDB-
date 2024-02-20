import { createInterval } from "../../index.mjs";
import { findUserBySessionId } from "../../index.mjs";
import { ObjectId } from "../../index.mjs";
// const auth = require("../../index.js");
// const Router = require("express");
import express from "express";
const timersRouter = express.Router();
const app = express();

const auth = () => async (req, res, next) => {
  if (!req.cookies["sessionId"]) {
    return next();
  }
  const user = await findUserBySessionId(req.db, req.cookies["sessionId"]);
  req.user = user;
  req.sessionId = req.cookies["sessionId"];
  next();
};

timersRouter.get("/timers", auth(), async (req, res) => {
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

timersRouter.post("/timers", auth(), async (req, res) => {
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

timersRouter.post("/timers/:id/stop", async (req, res) => {
  const d = new Date();
  const timer = await req.db.collection("timers").findOne({ _id: new ObjectId(`${req.params.id}`) });
  const timer2 = await req.db
    .collection("timers")
    .updateOne(
      { _id: new ObjectId(`${req.params.id}`) },
      { $set: { duration: Date.now() - timer.start, end: Date.now(), isActive: false } }
    );
  res.json(timer2);
});

export { timersRouter };
