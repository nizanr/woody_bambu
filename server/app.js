import express from "express";
import session from "express-session";
import MongoStore from "connect-mongo";
import bcrypt from "bcryptjs";
import Iyzipay from "iyzipay";
import { User, Product, Order, Design } from "./db.js";
import crypto from "node:crypto";
import mongoose from "mongoose";
export function createApp(uri, { paymentClient } = {}) {
  const app = express();
  const appUrl = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL;
  if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);
  app.get("/api/health", (req, res) =>
    res
      .status(mongoose.connection.readyState === 1 ? 200 : 503)
      .json({ ok: mongoose.connection.readyState === 1 }),
  );
  const iyzico =
    paymentClient ||
    (process.env.IYZICO_API_KEY && process.env.IYZICO_SECRET_KEY
      ? new Iyzipay({
          apiKey: process.env.IYZICO_API_KEY,
          secretKey: process.env.IYZICO_SECRET_KEY,
          uri: "https://sandbox-api.iyzipay.com",
        })
      : null);
  const gateway = (method, body) =>
    new Promise((resolve, reject) =>
      iyzico.checkoutForm[method](body, (e, r) =>
        e
          ? reject(e)
          : r.status === "success"
            ? resolve(r)
            : reject(Error(r.errorMessage || "Ödeme sağlayıcısı hatası")),
      ),
    );
  if (
    process.env.NODE_ENV === "production" &&
    (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
  )
    throw Error(
      "SESSION_SECRET must contain at least 32 characters in production",
    );
  app.locals.sessionStore = MongoStore.create({ mongoUrl: uri });
  app.use(express.json({ limit: "100kb" }));
  app.use(
    session({
      secret:
        process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
      resave: false,
      saveUninitialized: false,
      store: app.locals.sessionStore,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 86400000,
      },
    }),
  );
  app.use("/api", (req, res, next) => {
    if (
      req.path !== "/payment/callback" &&
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin &&
      ![`${req.protocol}://${req.get("host")}`, appUrl].includes(
        req.headers.origin,
      )
    )
      return res.status(403).json({ error: "Geçersiz kaynak" });
    next();
  });
  const auth = (req, res, next) =>
    req.session.user
      ? next()
      : res.status(401).json({ error: "Önce giriş yapın" });
  const roles =
    (...allowed) =>
    async (req, res, next) => {
      const u = await User.findById(req.session.user?.id);
      if (!u || !allowed.includes(u.role))
        return res.status(403).json({ error: "Bu işlem için yetkiniz yok" });
      next();
    };
  const view = (u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
  });
  const attempts = new Map();
  app.post("/api/auth/:action", async (req, res) => {
    const { name, email, password } = req.body;
    const key = req.ip;
    const a = attempts.get(key) || { count: 0, time: Date.now() };
    if (Date.now() - a.time > 600000) {
      a.count = 0;
      a.time = Date.now();
    }
    attempts.set(key, a);
    if (++a.count > 30)
      return res
        .status(429)
        .json({ error: "Çok fazla deneme. 10 dakika sonra tekrar deneyin." });
    if (
      typeof email !== "string" ||
      !/^\S+@\S+\.\S+$/.test(email) ||
      typeof password !== "string" ||
      password.length < 8 ||
      password.length > 128
    )
      return res
        .status(400)
        .json({ error: "Geçerli e-posta ve en az 8 karakterli şifre gerekli" });
    const normalized = email.trim().toLowerCase();
    let u;
    if (req.params.action === "register") {
      if (typeof name !== "string" || !name.trim())
        return res.status(400).json({ error: "Adınızı girin" });
      if (await User.exists({ email: normalized }))
        return res.status(409).json({ error: "Bu e-posta zaten kayıtlı" });
      u = await User.create({
        name: name.trim().slice(0, 80),
        email: normalized,
        password: await bcrypt.hash(password, 12),
      });
    } else if (req.params.action === "login") {
      u = await User.findOne({ email: normalized });
      if (!u || !(await bcrypt.compare(password, u.password)))
        return res.status(401).json({ error: "E-posta veya şifre hatalı" });
    } else return res.sendStatus(404);
    await new Promise((resolve, reject) =>
      req.session.regenerate((e) => (e ? reject(e) : resolve())),
    );
    req.session.user = view(u);
    res.json(view(u));
  });
  app.get("/api/me", async (req, res) => {
    const u = req.session.user && (await User.findById(req.session.user.id));
    res.json(u ? view(u) : null);
  });
  app.post("/api/logout", (req, res) =>
    req.session.destroy(() => res.json({ ok: true })),
  );
  app.get("/api/products", async (req, res) =>
    res.json(await Product.find().sort({ createdAt: 1 })),
  );
  app.get("/api/payment-config", (req, res) =>
    res.json({
      provider: iyzico ? "iyzico" : "demo",
      label: iyzico
        ? "iyzico test ödemesi"
        : "Demo ödeme — gerçek para çekilmez",
    }),
  );
  app.post("/api/orders", auth, async (req, res) => {
    const { items, address } = req.body;
    if (
      !Array.isArray(items) ||
      !items.length ||
      items.length > 30 ||
      typeof address !== "string" ||
      address.trim().length < 10
    )
      return res.status(400).json({
        error: "Sepet ve en az 10 karakterli teslimat adresi gerekli",
      });
    let total = 0;
    const lines = [];
    const seen = new Set();
    for (const i of items) {
      if (
        !/^[a-f\d]{24}$/.test(i.id) ||
        seen.has(i.id) ||
        !Number.isInteger(i.quantity) ||
        i.quantity < 1 ||
        i.quantity > 20
      )
        return res.status(400).json({ error: "Geçersiz sepet" });
      seen.add(i.id);
      const p = await Product.findById(i.id);
      if (!p || p.stock < i.quantity)
        return res.status(409).json({ error: "Ürün stokta yeterli değil" });
      total += p.price * i.quantity;
      lines.push({
        id: p.id,
        name: p.name,
        price: p.price,
        quantity: i.quantity,
      });
    }
    if (iyzico && !appUrl)
      return res.status(503).json({ error: "Ödeme için APP_URL ayarlanmalı" });
    const reserved = [];
    let o;
    try {
      for (const line of lines) {
        const p = await Product.findOneAndUpdate(
          { _id: line.id, stock: { $gte: line.quantity } },
          { $inc: { stock: -line.quantity } },
          { new: true },
        );
        if (!p) throw Error("Stok değişti, sepetinizi güncelleyin");
        reserved.push(line);
      }
      o = await Order.create({
        user: req.session.user.id,
        items: lines,
        total,
        address: address.trim(),
        paymentMode: iyzico ? "iyzico" : "demo",
      });
    } catch (e) {
      for (const line of reserved)
        await Product.updateOne(
          { _id: line.id },
          { $inc: { stock: line.quantity } },
        );
      return res.status(409).json({ error: e.message });
    }
    if (iyzico) {
      const origin = appUrl;
      if (!origin)
        return res
          .status(503)
          .json({ error: "Ödeme için APP_URL ayarlanmalı" });
      const u = await User.findById(req.session.user.id);
      let s;
      try {
        s = await gateway("initialize", {
          locale: "tr",
          conversationId: o.id,
          price: String(total),
          paidPrice: String(total),
          currency: "TRY",
          basketId: o.id,
          paymentGroup: "PRODUCT",
          callbackUrl: origin + "/api/payment/callback",
          buyer: {
            id: u.id,
            name: u.name.split(" ")[0],
            surname: u.name.split(" ").slice(1).join(" ") || "Test",
            gsmNumber: "+905350000000",
            email: u.email,
            identityNumber: "74300864791",
            registrationAddress: address,
            ip: req.ip,
            city: "Istanbul",
            country: "Turkey",
          },
          shippingAddress: {
            contactName: u.name,
            city: "Istanbul",
            country: "Turkey",
            address,
          },
          billingAddress: {
            contactName: u.name,
            city: "Istanbul",
            country: "Turkey",
            address,
          },
          basketItems: lines.map((i) => ({
            id: i.id,
            name: i.name,
            category1: "Bahçe Mobilyası",
            itemType: "PHYSICAL",
            price: String(i.price * i.quantity),
          })),
        });
      } catch (e) {
        await Order.updateOne({ _id: o.id }, { $set: { status: "cancelled" } });
        for (const line of reserved)
          await Product.updateOne(
            { _id: line.id },
            { $inc: { stock: line.quantity } },
          );
        return res.status(503).json({
          error:
            "Ödeme servisi başlatılamadı; stok iade edildi. Yeniden deneyin.",
        });
      }
      o.paymentToken = s.token;
      await o.save();
      return res.json({ order: o, url: s.paymentPageUrl });
    }
    res.json({ order: o });
  });
  app.post("/api/orders/:id/pay", auth, async (req, res) => {
    if (!/^[a-f\d]{24}$/.test(req.params.id)) return res.sendStatus(404);
    const o = await Order.findOne({
      _id: req.params.id,
      user: req.session.user.id,
    });
    if (!o) return res.sendStatus(404);
    if (o.status === "cancelled")
      return res.status(409).json({ error: "İptal edilen sipariş ödenemez" });
    if (o.status !== "pending") return res.json(o);
    if (o.paymentMode === "iyzico") {
      const s = await gateway("retrieve", {
        locale: "tr",
        conversationId: o.id,
        token: o.paymentToken,
      });
      if (s.paymentStatus !== "SUCCESS" || Number(s.paidPrice) !== o.total)
        return res.status(409).json({ error: "Ödeme henüz doğrulanmadı" });
      o.status = "paid";
    } else o.status = "demo_paid";
    const updated = await Order.findOneAndUpdate(
      { _id: o.id, status: "pending" },
      { $set: { status: o.status } },
      { new: true },
    );
    if (!updated)
      return res
        .status(409)
        .json({ error: "Sipariş durumu değişti; yöneticinize başvurun" });
    res.json(updated);
  });
  app.post(
    "/api/payment/callback",
    express.urlencoded({ extended: false }),
    async (req, res) => {
      if (!iyzico || typeof req.body.token !== "string")
        return res.sendStatus(400);
      const o = await Order.findOne({ paymentToken: req.body.token });
      if (!o) return res.sendStatus(404);
      res.redirect("/?payment=" + o.id);
    },
  );
  app.post("/api/orders/:id/cancel", auth, async (req, res) => {
    const o = await Order.findOneAndUpdate(
      {
        _id: req.params.id,
        user: req.session.user.id,
        status: "pending",
        paymentMode: "demo",
      },
      { $set: { status: "cancelled" } },
      { new: true },
    );
    if (!o)
      return res.status(409).json({
        error:
          "Yalnızca ödeme bekleyen demo sipariş iptal edilebilir. iyzico siparişinde sağlayıcı mutabakatı gerekir",
      });
    for (const i of o.items)
      await Product.updateOne({ _id: i.id }, { $inc: { stock: i.quantity } });
    res.json(o);
  });
  app.get("/api/orders", auth, async (req, res) =>
    res.json(
      await Order.find({ user: req.session.user.id }).sort({ createdAt: -1 }),
    ),
  );
  app.get("/api/designs", auth, async (req, res) =>
    res.json(await Design.find({ user: req.session.user.id })),
  );
  app.post("/api/designs", auth, async (req, res) => {
    const { name, productId, x, y, scale, rotation } = req.body;
    if (
      typeof name !== "string" ||
      !name.trim() ||
      !(await Product.exists({ _id: productId })) ||
      ![x, y, scale, rotation].every(Number.isFinite) ||
      scale < 0.2 ||
      scale > 3
    )
      return res.status(400).json({ error: "Geçersiz tasarım" });
    res.json(
      await Design.create({
        user: req.session.user.id,
        name: name.slice(0, 80),
        productId,
        x,
        y,
        scale,
        rotation,
      }),
    );
  });
  app.get("/api/admin", auth, roles("admin", "superadmin"), async (req, res) =>
    res.json({
      products: await Product.find(),
      orders: await Order.find().sort({ createdAt: -1 }),
      users: await User.find().select("-password"),
    }),
  );
  const validProduct = (p) =>
    typeof p.name === "string" &&
    p.name.trim() &&
    ["Oturma Grupları", "Sandalyeler", "Masalar", "Şezlonglar"].includes(
      p.category,
    ) &&
    Number.isFinite(p.price) &&
    p.price > 0 &&
    Number.isInteger(p.stock) &&
    p.stock >= 0 &&
    typeof p.image === "string" &&
    (/^https:\/\//.test(p.image) ||
      /^\/images\/[a-zA-Z0-9_-]+\.(png|jpg|webp)$/.test(p.image));
  app.post(
    "/api/admin/products",
    auth,
    roles("admin", "superadmin"),
    async (req, res) => {
      if (!validProduct(req.body))
        return res.status(400).json({ error: "Ürün alanlarını kontrol edin" });
      const { name, category, price, stock, image, description, color } =
        req.body;
      res.json(
        await Product.create({
          name,
          category,
          price,
          stock,
          image,
          description,
          color,
        }),
      );
    },
  );
  app.patch(
    "/api/admin/products/:id",
    auth,
    roles("admin", "superadmin"),
    async (req, res) => {
      const p = await Product.findById(req.params.id);
      if (!p) return res.sendStatus(404);
      const data = { ...p.toObject(), ...req.body };
      if (!validProduct(data))
        return res.status(400).json({ error: "Geçersiz ürün" });
      for (const k of [
        "name",
        "category",
        "price",
        "stock",
        "image",
        "description",
        "color",
      ])
        p[k] = data[k];
      await p.save();
      res.json(p);
    },
  );
  app.patch(
    "/api/admin/orders/:id",
    auth,
    roles("admin", "superadmin"),
    async (req, res) => {
      const o = await Order.findById(req.params.id);
      if (!o) return res.sendStatus(404);
      if (
        !["paid", "demo_paid", "preparing", "shipped"].includes(o.status) ||
        !["preparing", "shipped", "delivered"].includes(req.body.status)
      )
        return res
          .status(400)
          .json({ error: "Ödenmemiş sipariş sevk edilemez" });
      o.status = req.body.status;
      await o.save();
      res.json(o);
    },
  );
  app.patch(
    "/api/admin/users/:id",
    auth,
    roles("superadmin"),
    async (req, res) => {
      if (
        req.params.id === req.session.user.id ||
        !["user", "admin", "superadmin"].includes(req.body.role)
      )
        return res.status(400).json({
          error: "Kendi rolünüzü değiştiremezsiniz veya rol geçersiz",
        });
      const u = await User.findByIdAndUpdate(
        req.params.id,
        { role: req.body.role },
        { new: true },
      );
      res.json(u ? view(u) : null);
    },
  );
  /* ─── Live visitor counter (SSE) ─── */
  const visitors = new Set();
  const broadcast = () => {
    const data = `data: ${JSON.stringify({ count: visitors.size })}\n\n`;
    for (const res of visitors) res.write(data);
  };
  app.get("/api/visitors/stream", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(`data: ${JSON.stringify({ count: visitors.size + 1 })}\n\n`);
    visitors.add(res);
    broadcast();
    req.on("close", () => {
      visitors.delete(res);
      broadcast();
    });
  });
  app.get("/api/visitors/count", (req, res) =>
    res.json({ count: visitors.size }),
  );

  app.use((e, req, res, next) => {
    console.error(e.message);
    res
      .status(e.name === "CastError" ? 400 : 500)
      .json({ error: "İşlem tamamlanamadı. Bilgileri kontrol edin." });
  });
  return app;
}
export async function seed() {
  if (await Product.countDocuments()) return;
  await Product.insertMany([
    {
      name: "Luna Bahçe Oturma Grubu",
      category: "Oturma Grupları",
      price: 24990,
      stock: 12,
      image: "/images/product-sofa.png",
      description:
        "Doğal ahşabın sıcaklığı, yumuşak minderlerin konforuyla buluşuyor. 4 kişilik takım, açık havada uzun sohbetler için.",
      color: "#b79b77",
    },
    {
      name: "Terra Örgü Sandalye",
      category: "Sandalyeler",
      price: 3490,
      stock: 28,
      image: "/images/product-chair.png",
      description:
        "Hafif, dayanıklı ve zamansız. El örgüsü dokusuyla bahçenizin yeni favorisi.",
      color: "#ae8358",
    },
    {
      name: "Olive Ahşap Bahçe Masası",
      category: "Masalar",
      price: 8990,
      stock: 8,
      image: "/images/product-table.png",
      description:
        "Altı kişilik geniş yüzey ve masif ahşap tasarım. Güneşli kahvaltılara davet.",
      color: "#98734e",
    },
    {
      name: "Soleil Şezlong",
      category: "Şezlonglar",
      price: 6490,
      stock: 16,
      image: "/images/product-lounger.png",
      description:
        "Ayarlanabilir sırt desteği ve rahat minder. Kendinize ayırdığınız anlar için.",
      color: "#d0bc95",
    },
  ]);
}
