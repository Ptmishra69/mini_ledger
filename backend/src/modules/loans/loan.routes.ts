import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth.middleware";

const router = Router();

router.use(requireAuth);

const createLoanSchema = z.object({
  friendName: z.string().trim().min(1).max(100),
  // Accepts 255, "255" or "255.50" and normalizes to a string.
  amount: z
    .union([z.string(), z.number()])
    .transform((value) => String(value).trim())
    .pipe(
      z
        .string()
        .regex(/^\d{1,10}(\.\d{1,2})?$/, "Up to 10 digits and 2 decimal places")
        .refine((value) => Number(value) > 0, {
          message: "Amount must be greater than zero",
        })
    ),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD")
    .refine(
      (value) => {
        const date = new Date(`${value}T00:00:00.000Z`);
        return (
          !Number.isNaN(date.getTime()) &&
          date.toISOString().slice(0, 10) === value
        );
      },
      { message: "Enter a valid date in YYYY-MM-DD format" }
    ),
});

const idSchema = z.string().uuid();

// POST /api/loans
router.post("/", async (req, res) => {
  const parsed = createLoanSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid loan details",
      errors: parsed.error.flatten(),
    });
  }

  try {
    const loan = await prisma.loan.create({
      data: {
        userId: res.locals.userId,
        friendName: parsed.data.friendName,
        amount: parsed.data.amount,
        dueDate: new Date(`${parsed.data.dueDate}T00:00:00.000Z`),
      },
    });

    return res.status(201).json({
      message: "Loan created successfully",
      loan: {
        ...loan,
        amount: loan.amount.toString(),
      },
    });
  } catch (error) {
    console.error("Create loan failed:", error);

    return res.status(500).json({
      message: "Unable to create loan",
    });
  }
});

// GET /api/loans
router.get("/", async (_req, res) => {
  try {
    const loans = await prisma.loan.findMany({
      where: {
        userId: res.locals.userId,
      },
      orderBy: [
        { isRepaid: "asc" },
        { dueDate: "asc" },
        { createdAt: "desc" },
      ],
    });

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const entries = loans.map((loan) => ({
      ...loan,
      amount: loan.amount.toString(),
      isOverdue: !loan.isRepaid && loan.dueDate < today,
    }));

    return res.status(200).json({ loans: entries });
  } catch (error) {
    console.error("List loans failed:", error);

    return res.status(500).json({
      message: "Unable to fetch loans",
    });
  }
});

// GET /api/loans/summary
// Declared before any future "/:id" GET route so it is never shadowed.
router.get("/summary", async (_req, res) => {
  try {
    const userId = res.locals.userId;

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const [allLoans, repaidLoans, overdueLoans] = await Promise.all([
      prisma.loan.aggregate({
        where: { userId },
        _sum: { amount: true },
      }),
      prisma.loan.aggregate({
        where: { userId, isRepaid: true },
        _sum: { amount: true },
      }),
      prisma.loan.aggregate({
        where: {
          userId,
          isRepaid: false,
          dueDate: { lt: today },
        },
        _sum: { amount: true },
      }),
    ]);

    const zero = new Prisma.Decimal(0);
    const totalLent = allLoans._sum.amount ?? zero;
    const totalRepaid = repaidLoans._sum.amount ?? zero;
    const overdueAmount = overdueLoans._sum.amount ?? zero;

    // Prisma Decimal supports exact decimal arithmetic.
    const outstanding = totalLent.minus(totalRepaid).toFixed(2);

    return res.status(200).json({
      totalLent: totalLent.toString(),
      totalRepaid: totalRepaid.toString(),
      overdueAmount: overdueAmount.toString(),
      outstandingAmount: outstanding,
    });
  } catch (error) {
    console.error("Loan summary failed:", error);

    return res.status(500).json({
      message: "Unable to fetch loan summary",
    });
  }
});

// PATCH /api/loans/:id/repay
router.patch("/:id/repay", async (req, res) => {
  const parsedId = idSchema.safeParse(req.params.id);

  if (!parsedId.success) {
    return res.status(400).json({
      message: "Invalid loan ID",
    });
  }

  const userId = res.locals.userId;

  try {
    // Atomic update: only succeeds if the loan belongs to the user and is not repaid yet.
    const result = await prisma.loan.updateMany({
      where: { id: parsedId.data, userId, isRepaid: false },
      data: { isRepaid: true, repaidAt: new Date() },
    });

    if (result.count === 0) {
      const existing = await prisma.loan.findFirst({
        where: { id: parsedId.data, userId },
        select: { isRepaid: true },
      });

      if (!existing) {
        return res.status(404).json({ message: "Loan not found" });
      }

      return res.status(409).json({ message: "Loan has already been repaid" });
    }

    const updatedLoan = await prisma.loan.findFirstOrThrow({
      where: { id: parsedId.data, userId },
    });

    return res.status(200).json({
      message: "Loan marked as repaid",
      loan: {
        ...updatedLoan,
        amount: updatedLoan.amount.toString(),
      },
    });
  } catch (error) {
    console.error("Repay loan failed:", error);

    return res.status(500).json({
      message: "Unable to mark loan as repaid",
    });
  }
});

export default router;