import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { createApp } from "../server/app.js";
import { User, Product, Order } from "../server/db.js";
let app, user, other, admin, superadmin, p, order;
const uri = "mongodb://127.0.0.1:27017/bahceni_test_" + Date.now();
before(async () => {
  await mongoose.connect(uri);
  app = createApp(uri);
  user = request.agent(app);
  other = request.agent(app);
  admin = request.agent(app);
  superadmin = request.agent(app);
  p = await Product.create({
    name: "Test sandalye",
    category: "Sandalyeler",
    price: 100,
    stock: 10,
    image: "https://example.com/image.jpg",
  });
  for (const [email, role, agent] of [
    ["admin@test.dev", "admin", admin],
    ["super@test.dev", "superadmin", superadmin],
  ]) {
    await User.create({
      name: role,
      email,
      password: await bcrypt.hash("TestPass123!", 4),
      role,
    });
    await agent
      .post("/api/auth/login")
      .send({ email, password: "TestPass123!" })
      .expect(200);
  }
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await app.locals.sessionStore.close();
});
test("public catalog lists persisted products", async () => {
  const r = await request(app).get("/api/products").expect(200);
  assert.equal(r.body[0].price, 100);
});
test("anonymous admin access denied", async () => {
  await request(app).get("/api/admin").expect(401);
});
test("weak registration rejected", async () => {
  await user
    .post("/api/auth/register")
    .send({ name: "A", email: "u@test.dev", password: "123" })
    .expect(400);
});
test("registration ignores injected role", async () => {
  const r = await user
    .post("/api/auth/register")
    .send({
      name: "User",
      email: "u@test.dev",
      password: "TestPass123!",
      role: "superadmin",
    })
    .expect(200);
  assert.equal(r.body.role, "user");
});
test("duplicate email rejected", async () => {
  await request(app)
    .post("/api/auth/register")
    .send({ name: "U", email: "U@test.dev", password: "TestPass123!" })
    .expect(409);
});
test("wrong password rejected", async () => {
  await request(app)
    .post("/api/auth/login")
    .send({ email: "u@test.dev", password: "wrongpassword" })
    .expect(401);
});
test("session identifies current user", async () => {
  const r = await user.get("/api/me").expect(200);
  assert.equal(r.body.email, "u@test.dev");
});
test("user cannot access admin or mutate product", async () => {
  await user.get("/api/admin").expect(403);
  await user.post("/api/admin/products").send({}).expect(403);
});
test("cross-origin mutation rejected", async () => {
  await user
    .post("/api/orders")
    .set("Origin", "https://evil.example")
    .send({})
    .expect(403);
});
test("invalid quantity rejected", async () => {
  await user
    .post("/api/orders")
    .send({ items: [{ id: p.id, quantity: -1 }], address: "Test street 123" })
    .expect(400);
});
test("duplicate cart lines rejected", async () => {
  await user
    .post("/api/orders")
    .send({
      items: [
        { id: p.id, quantity: 1 },
        { id: p.id, quantity: 1 },
      ],
      address: "Test street 123",
    })
    .expect(400);
});
test("server computes price and reserves stock", async () => {
  const r = await user
    .post("/api/orders")
    .send({
      items: [{ id: p.id, quantity: 2, price: 1 }],
      address: "Test street 123",
      total: 1,
    })
    .expect(200);
  order = r.body.order;
  assert.equal(order.total, 200);
  assert.equal((await Product.findById(p.id)).stock, 8);
  assert.equal(order.status, "pending");
});
test("order access scoped to owner", async () => {
  await other
    .post("/api/auth/register")
    .send({ name: "Other", email: "other@test.dev", password: "TestPass123!" })
    .expect(200);
  await other.post("/api/orders/" + order._id + "/pay").expect(404);
  const r = await other.get("/api/orders").expect(200);
  assert.equal(r.body.length, 0);
});
test("pending order cannot ship", async () => {
  await admin
    .patch("/api/admin/orders/" + order._id)
    .send({ status: "shipped" })
    .expect(400);
});
test("demo payment is clearly distinguished and idempotent", async () => {
  const r = await user.post("/api/orders/" + order._id + "/pay").expect(200);
  assert.equal(r.body.status, "demo_paid");
  await user.post("/api/orders/" + order._id + "/pay").expect(200);
  assert.equal((await Product.findById(p.id)).stock, 8);
});
test("paid order cannot be cancelled", async () => {
  await user.post("/api/orders/" + order._id + "/cancel").expect(409);
});
test("cancel restores stock once", async () => {
  const r = await user
    .post("/api/orders")
    .send({ items: [{ id: p.id, quantity: 1 }], address: "Test street 123" })
    .expect(200);
  await user.post("/api/orders/" + r.body.order._id + "/cancel").expect(200);
  await user.post("/api/orders/" + r.body.order._id + "/cancel").expect(409);
  assert.equal((await Product.findById(p.id)).stock, 8);
});
test("insufficient stock rejected", async () => {
  await user
    .post("/api/orders")
    .send({ items: [{ id: p.id, quantity: 10 }], address: "Test street 123" })
    .expect(409);
});
test("admin can add product with validation", async () => {
  await admin
    .post("/api/admin/products")
    .send({ name: "bad", price: -1 })
    .expect(400);
  const r = await admin
    .post("/api/admin/products")
    .send({
      name: "Masa",
      category: "Masalar",
      price: 800,
      stock: 3,
      image: "https://example.com/table.jpg",
    })
    .expect(200);
  assert.equal((await Product.findById(r.body._id)).name, "Masa");
});
test("admin cannot change roles", async () => {
  const u = await User.findOne({ email: "other@test.dev" });
  await admin
    .patch("/api/admin/users/" + u.id)
    .send({ role: "admin" })
    .expect(403);
});
test("superadmin can change roles; own demotion denied", async () => {
  const u = await User.findOne({ email: "other@test.dev" });
  await superadmin
    .patch("/api/admin/users/" + u.id)
    .send({ role: "admin" })
    .expect(200);
  const s = await User.findOne({ email: "super@test.dev" });
  await superadmin
    .patch("/api/admin/users/" + s.id)
    .send({ role: "user" })
    .expect(400);
});
test("saved placement persists for owner only", async () => {
  await user
    .post("/api/designs")
    .send({
      name: "Bahçem",
      productId: p.id,
      x: 0,
      y: 1,
      scale: 1,
      rotation: 90,
    })
    .expect(200);
  assert.equal((await user.get("/api/designs")).body.length, 1);
  assert.equal((await other.get("/api/designs")).body.length, 0);
});
test("invalid model scale rejected", async () => {
  await user
    .post("/api/designs")
    .send({ name: "Bad", productId: p.id, x: 0, y: 0, scale: 20, rotation: 0 })
    .expect(400);
});
test("logout invalidates session", async () => {
  await user.post("/api/logout").expect(200);
  await user.get("/api/orders").expect(401);
});

test("cancelled order cannot be marked paid", async () => {
  await user
    .post("/api/auth/login")
    .send({ email: "u@test.dev", password: "TestPass123!" })
    .expect(200);
  const r = await user
    .post("/api/orders")
    .send({ items: [{ id: p.id, quantity: 1 }], address: "Test street 123" })
    .expect(200);
  await user.post("/api/orders/" + r.body.order._id + "/cancel").expect(200);
  await user.post("/api/orders/" + r.body.order._id + "/pay").expect(409);
});
test("iyzico adapter verifies payment, rejects unpaid and mismatched amount", async () => {
  process.env.APP_URL = "https://test.example";
  let result = {
    status: "success",
    paymentStatus: "FAILURE",
    paidPrice: "100",
  };
  const client = {
    checkoutForm: {
      initialize: (body, cb) =>
        cb(null, {
          status: "success",
          token: "test-token",
          paymentPageUrl: "https://sandbox-api.iyzipay.com/test",
        }),
      retrieve: (body, cb) => cb(null, result),
    },
  };
  const a = createApp(uri, { paymentClient: client });
  const agent = request.agent(a);
  try {
    await agent
      .post("/api/auth/login")
      .send({ email: "u@test.dev", password: "TestPass123!" })
      .expect(200);
    const r = await agent
      .post("/api/orders")
      .send({ items: [{ id: p.id, quantity: 1 }], address: "Test street 123" })
      .expect(200);
    assert.equal(r.body.order.paymentMode, "iyzico");
    assert.ok(r.body.url.startsWith("https://"));
    await agent.post("/api/orders/" + r.body.order._id + "/pay").expect(409);
    result = { status: "success", paymentStatus: "SUCCESS", paidPrice: "1" };
    await agent.post("/api/orders/" + r.body.order._id + "/pay").expect(409);
    result = { status: "success", paymentStatus: "SUCCESS", paidPrice: "100" };
    const paid = await agent
      .post("/api/orders/" + r.body.order._id + "/pay")
      .expect(200);
    assert.equal(paid.body.status, "paid");
  } finally {
    await a.locals.sessionStore.close();
    delete process.env.APP_URL;
  }
});
test("iyzico initialization failure restores reservation", async () => {
  process.env.APP_URL = "https://test.example";
  const stock = (await Product.findById(p.id)).stock;
  const a = createApp(uri, {
    paymentClient: {
      checkoutForm: {
        initialize: (body, cb) =>
          cb(null, { status: "failure", errorMessage: "Sandbox unavailable" }),
      },
    },
  });
  try {
    const agent = request.agent(a);
    await agent
      .post("/api/auth/login")
      .send({ email: "u@test.dev", password: "TestPass123!" })
      .expect(200);
    await agent
      .post("/api/orders")
      .send({ items: [{ id: p.id, quantity: 1 }], address: "Test street 123" })
      .expect(503);
    assert.equal((await Product.findById(p.id)).stock, stock);
  } finally {
    await a.locals.sessionStore.close();
    delete process.env.APP_URL;
  }
});

test("concurrent buyers cannot reserve the same last unit", async () => {
  const last = await Product.create({
    name: "Last unit",
    category: "Sandalyeler",
    price: 100,
    stock: 1,
    image: "/images/product-chair.png",
  });
  const payload = {
    items: [{ id: last.id, quantity: 1 }],
    address: "Test street 123",
  };
  const responses = await Promise.all([
    user.post("/api/orders").send(payload),
    other.post("/api/orders").send(payload),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await Product.findById(last.id)).stock, 0);
});

test("database health endpoint reports readiness", async () => {
  const r = await request(app).get("/api/health").expect(200);
  assert.equal(r.body.ok, true);
});
test("production requires strong session secret", () => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    SESSION_SECRET: process.env.SESSION_SECRET,
  };
  try {
    process.env.NODE_ENV = "production";
    process.env.SESSION_SECRET = "short";
    assert.throws(() => createApp(uri), /32 characters/);
  } finally {
    for (const [name, value] of Object.entries(previous))
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
  }
});
test("production behind HTTPS proxy accepts Render origin and sets secure cookie", async () => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    SESSION_SECRET: process.env.SESSION_SECRET,
    RENDER_EXTERNAL_URL: process.env.RENDER_EXTERNAL_URL,
  };
  let a;
  try {
    process.env.NODE_ENV = "production";
    process.env.SESSION_SECRET = "a".repeat(64);
    process.env.RENDER_EXTERNAL_URL = "https://test.onrender.com";
    a = createApp(uri);
    const r = await request(a)
      .post("/api/auth/login")
      .set("X-Forwarded-Proto", "https")
      .set("Origin", "https://test.onrender.com")
      .send({ email: "u@test.dev", password: "TestPass123!" })
      .expect(200);
    assert.match(r.headers["set-cookie"][0], /; Secure/);
    assert.match(r.headers["set-cookie"][0], /; HttpOnly/);
    await request(a)
      .post("/api/auth/login")
      .set("X-Forwarded-Proto", "https")
      .set("Origin", "https://evil.example")
      .send({ email: "u@test.dev", password: "TestPass123!" })
      .expect(403);
  } finally {
    await a?.locals.sessionStore.close();
    for (const [name, value] of Object.entries(previous))
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
  }
});
