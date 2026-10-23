# MiniLedger 💸

**MiniLedger** is a personal loan-tracking application that helps users keep track of money lent to friends, monitor repayment deadlines, and identify overdue loans.

## Features

- **Phone number authentication:** Mock OTP login with OTP verification and JWT access tokens.
- **Loan management:** Create and view loan entries, including friend name, amount, and due date.
- **Repayment tracking:** Mark a loan as repaid.
- **Loan summary:** View total money lent, total repaid, outstanding balance, and overdue amount.
- **Overdue tracking:** Identify unpaid loans whose due dates have passed.
- **Input validation:** Validate incoming request data using Zod.
- **Persistent storage:** Store users and loans in PostgreSQL using Prisma ORM.

## Tech Stack

| Component | Technology |
|---|---|
| Backend | Node.js, Express.js, TypeScript |
| Database | PostgreSQL |
| ORM | Prisma |
| Validation | Zod |
| Authentication | JWT |
| Mobile app | React Native + Expo (planned/in progress) |

## Project Structure

```text
mini_ledger/
├── backend/
│   ├── prisma/
│   │   ├── migrations/
│   │   └── schema.prisma
│   ├── src/
│   │   ├── lib/
│   │   ├── middleware/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   └── loans/
│   │   ├── app.ts
│   │   └── server.ts
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
├── mobile/
└── README.md
```

## Prerequisites

Install the following before running the backend:

- Node.js and npm
- PostgreSQL
- Git

## Backend Setup

### 1. Clone the repository

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd mini_ledger/backend
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create the database

Connect to PostgreSQL and execute:

```sql
CREATE DATABASE miniledger;
```

If the database already exists, skip this step.

### 4. Configure environment variables

Create a `.env` file inside `backend/`:

```env
DATABASE_URL="postgresql://YOUR_USERNAME:YOUR_PASSWORD@localhost:5432/miniledger?schema=public"
JWT_SECRET="replace_with_a_long_random_secret"
PORT=5000
```

Replace the database credentials with your local PostgreSQL credentials. Use a strong, private JWT secret.

Never commit `.env` or real credentials to GitHub.

### 5. Apply database migrations

```bash
npx prisma migrate deploy
npx prisma generate
```

The migration command applies committed Prisma migrations. Ensure the initial migration has been created and committed before using this command.

For local development, if you need to create a new migration after modifying the Prisma schema, use:

```bash
npx prisma migrate dev --name describe_your_change
```

### 6. Start the development server

```bash
npm run dev
```

The backend runs at:

`http://localhost:5000`

### 7. Verify the server

Open:

`http://localhost:5000/api/health`

Expected response:

```json
{
  "status": "ok",
  "message": "MiniLedger API is running"
}
```

## API Endpoints

All loan endpoints require a valid JWT access token.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Check API status |
| POST | `/api/auth/send-otp` | Generate a mock OTP |
| POST | `/api/auth/verify-otp` | Verify OTP and obtain an access token |
| GET | `/api/loans` | List the authenticated user's loans |
| POST | `/api/loans` | Create a loan entry |
| PATCH | `/api/loans/:id/repay` | Mark a loan as repaid |
| GET | `/api/loans/summary` | Get loan totals and overdue amount |

### Authentication Flow

1. Send a phone number to `/api/auth/send-otp`.
2. Read the generated OTP from the backend terminal.
3. Submit the phone number and OTP to `/api/auth/verify-otp`.
4. Use the returned access token in subsequent loan requests.

For authenticated requests, include:

```http
Authorization: Bearer YOUR_ACCESS_TOKEN
```

### Example: Create a Loan

**Request**

`POST /api/loans`

```json
{
  "friendName": "Rahul",
  "amount": "1500.00",
  "dueDate": "2026-10-22"
}
```

Include the JWT authorization header.

### Example: Loan Summary

**Request**

`GET /api/loans/summary`

Example response:

```json
{
  "totalLent": "1500",
  "totalRepaid": "0",
  "overdueAmount": "1500",
  "outstandingAmount": "1500.00"
}
```

The values above are illustrative. Actual results depend on the authenticated user's loans and their repayment status.

## Business Rules

- Loan amounts must be greater than zero.
- Each loan belongs to one user.
- Users can access only their own loan entries.
- A loan is overdue when it remains unpaid after its due date.
- Marking a loan as repaid records its repayment timestamp.
- The summary distinguishes total lent, total repaid, overdue amount, and outstanding balance.

## Security and Limitations

- OTP delivery is mocked; codes are printed in the server logs instead of being sent by SMS.
- OTPs are held in memory and are lost when the server restarts.
- JWTs are required for protected loan operations.
- Production use would require stronger authentication controls, rate limiting, secure secret management, and persistent OTP storage.

## Running the Mobile App

The React Native app will be documented here once its implementation is complete. It will provide phone/OTP login, a loan dashboard, overdue indicators, loan creation, and repayment tracking.

## Author

**Parth Mishra**

- GitHub: https://github.com/Ptmishra69
- LinkedIn: https://www.linkedin.com/in/parth-mishra-57334a286
