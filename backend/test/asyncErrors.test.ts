import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";
import "express-async-errors";
import { z } from "zod";
import { errorHandler } from "../src/utils/errors.js";

// A zod parse that fails inside an async handler must become a 400 response,
// not an unhandled rejection that takes the whole backend down.
test("async route validation errors reach errorHandler as 400", async () => {
  const app = express();
  const router = express.Router();
  router.get("/check", async (req, res) => {
    const q = z.object({ chat: z.string().regex(/^[^@]+@(s\.whatsapp\.net|g\.us|lid)$/) }).parse(req.query);
    res.json(q);
  });
  app.use(router);
  app.use(errorHandler);
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const bad = await fetch(`${base}/check?chat=12345@example.com`);
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).error, "Validation error");
    const lid = await fetch(`${base}/check?chat=193428214259744@lid`);
    assert.equal(lid.status, 200);
  } finally {
    server.close();
  }
});
