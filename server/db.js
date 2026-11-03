import mongoose from "mongoose";
export async function connectDB() {
  if (process.env.NODE_ENV === "production" && !process.env.MONGODB_URI)
    throw Error("MONGODB_URI is required in production");
  let uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/bahceni";
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 1500 });
    return uri;
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.log("Yerel MongoDB bulunamadı, bellek içi (in-memory) MongoDB başlatılıyor...");
      const { MongoMemoryServer } = await import("mongodb-memory-server");
      const mongod = await MongoMemoryServer.create();
      uri = mongod.getUri();
      await mongoose.connect(uri);
      console.log("Bellek içi MongoDB hazır!");
      return uri;
    }
    throw err;
  }
}
const userSchema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, unique: true },
    password: String,
    role: {
      type: String,
      enum: ["user", "admin", "superadmin"],
      default: "user",
    },
  },
  { timestamps: true },
);
export const User = mongoose.model("User", userSchema);
export const Product = mongoose.model(
  "Product",
  new mongoose.Schema(
    {
      name: String,
      category: String,
      price: Number,
      stock: Number,
      image: String,
      description: String,
      color: String,
    },
    { timestamps: true },
  ),
);
export const Order = mongoose.model(
  "Order",
  new mongoose.Schema(
    {
      user: mongoose.Schema.Types.ObjectId,
      items: Array,
      total: Number,
      address: String,
      status: { type: String, default: "pending" },
      paymentMode: String,
      paymentToken: String,
    },
    { timestamps: true },
  ),
);
export const Design = mongoose.model(
  "Design",
  new mongoose.Schema(
    {
      user: mongoose.Schema.Types.ObjectId,
      name: String,
      productId: String,
      x: Number,
      y: Number,
      scale: Number,
      rotation: Number,
    },
    { timestamps: true },
  ),
);
