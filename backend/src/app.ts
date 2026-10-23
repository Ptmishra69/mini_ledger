import express from "express";
import cors from "cors";
import authRoutes from "./modules/auth/auth.router";
import loanRoutes from "./modules/loans/loan.routes";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    message: "MiniLedger API is running",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/loans", loanRoutes);
export default app;