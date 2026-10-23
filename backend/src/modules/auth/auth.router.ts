
import { randomInt } from "node:crypto";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../../lib/prisma";

const router = Router();

const otpStore = new Map<
  string,
  { code: string; expiresAt: number; attempts: number }
>();

const phoneSchema = z.object({
  phone: z.string().trim().regex(
    /^\+?[1-9]\d{9,14}$/,
    "Enter a valid phone number"
  ),
});

const verifySchema = phoneSchema.extend({
  otp: z.string().regex(/^\d{6}$/, "OTP must contain 6 digits"),
});

router.post("/send-otp", (req, res) => {
  const parsed = phoneSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid request",
      errors: parsed.error.flatten(),
    });
  }

  const { phone } = parsed.data;
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");

  otpStore.set(phone, {
    code,
    expiresAt: Date.now() + 5 * 60 * 1000,
    attempts: 0,
  });

  console.log(`[MiniLedger DEV] OTP for ${phone}: ${code}`);

  return res.status(200).json({
    message: "OTP generated. Check the server terminal.",
  });
});

router.post("/verify-otp", async (req, res) => {
    console.log("VERIFY OTP REQUEST RECEIVED", req.body);
  const parsed = verifySchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid request",
      errors: parsed.error.flatten(),
    });
  }

  const { phone, otp } = parsed.data;
  const stored = otpStore.get(phone);

  if (!stored) {
    return res.status(400).json({
      message: "Request a new OTP",
    });
  }

  if (Date.now() > stored.expiresAt) {
    otpStore.delete(phone);
    return res.status(400).json({
      message: "OTP expired. Request a new one.",
    });
  }

  if (stored.attempts >= 5) {
    otpStore.delete(phone);
    return res.status(429).json({
      message: "Too many attempts. Request a new OTP.",
    });
  }

  if (stored.code !== otp) {
    stored.attempts += 1;

    if (stored.attempts >= 5) {
      otpStore.delete(phone);
    }

    return res.status(400).json({
      message: "Incorrect OTP",
    });
  }

  otpStore.delete(phone);

  try {
    const user = await prisma.user.upsert({
      where: { phone },
      update: {},
      create: { phone },
      select: {
        id: true,
        phone: true,
        createdAt: true,
      },
    });

    const secret = process.env.JWT_SECRET;

    if (!secret) {
      console.error("JWT_SECRET is not configured");
      return res.status(500).json({
        message: "Server configuration error",
      });
    }

    const accessToken = jwt.sign(
      { sub: user.id },
      secret,
      { expiresIn: "1h" }
    );

    return res.status(200).json({
      message: "Login successful",
      accessToken,
      user,
    });
  } catch (error) {
    console.error("OTP verification failed:", error);

    return res.status(500).json({
      message: "Unable to complete login",
    });
  }
});

export default router;
