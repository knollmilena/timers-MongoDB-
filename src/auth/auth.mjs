import bodyParser from "body-parser";
import argon from "argon2";
import {
  createUser,
  findUserByUsername,
  findUserBySessionId,
  createSession,
  deleteSession,
  loginAccount,
  createInterval,
} from "../../index.mjs";

import express from "express";
const authRouter = express.Router();

export const auth = () => async (req, res, next) => {
  if (!req.cookies["sessionId"]) {
    return next();
  }
  const user = await findUserBySessionId(req.db, req.cookies["sessionId"]);
  req.user = user;
  req.sessionId = req.cookies["sessionId"];
  next();
};
authRouter.post("/login", bodyParser.urlencoded({ extended: false }), async (req, res) => {
  const { username, password } = req.body;
  const user = await findUserByUsername(req.db, username);
  let checkPass;
  if (user) {
    checkPass = await argon.verify(user.password, password);
  }
  if (!checkPass) {
    return res.redirect("/?authError=true");
  }
  loginAccount(req.db, res, user._id);
});

authRouter.post("/signup", bodyParser.urlencoded({ extended: false }), async (req, res) => {
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

authRouter.get("/logout", auth(), async (req, res) => {
  if (!req.user) {
    return res.redirect("/");
  }
  await deleteSession(req.db, req.sessionId);
  res.clearCookie("sessionId").redirect("/");
});

export { authRouter };
