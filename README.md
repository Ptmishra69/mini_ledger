# MiniLedger 💸

MiniLedger is a personal loan-tracking application for keeping track of money lent to friends, repayment deadlines, and overdue loans. The repository contains an Express/TypeScript API and a React Native app built with Expo.

## Features

- **Phone authentication:** Mock OTP flow with verification and JWT access tokens.
- **Loan management:** Create and view loans with a friend's name, amount, and due date.
- **Repayment tracking:** Mark loans as repaid and record the repayment timestamp.
- **Loan summary:** View total lent, total repaid, outstanding balance, and overdue amount.
- **Overdue tracking:** Identify unpaid loans past their due date.
- **Request validation:** Validate API input with Zod.
- **Persistent storage:** PostgreSQL with Prisma ORM.
- **Mobile app:** Expo / React Native project in `mobile/` (implementation in progress).

## Tech Stack

| Area | Technology |
|---|---|
| Backend runtime | Node.js |
| API | Express.js 5, TypeScript |
| Database | PostgreSQL |
| ORM and migrations | Prisma 6 |
| Validation | Zod |
| Authentication | JWT |
| Mobile | React Native, Expo, Expo Router |
| Mobile language | TypeScript |

## Repository Structure

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
│   ├── app.json
│   ├── package.json
│   ├── src/
│   └── tsconfig.json
└── README.md
```

> Environment files and dependency folders such as `node_modules/` should not be committed.

## Prerequisites

- Node.js and npm
- PostgreSQL
- Git

## Backend Setup

### 1. Clone the repository

```bash
git clone https://github.com/Ptmishra69/mini_ledger.git
cd mini_ledger/backend
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create a PostgreSQL database and role

Connect to PostgreSQL as an administrator, then create a database and a dedicated application role. Choose your own strong password:

```sql
CREATE USER mini_ledger_user WITH PASSWORD 'REPLACE_WITH_A_STRONG_PASSWORD';
CREATE DATABASE miniledger OWNER mini_ledger_user;
```

If the database or role already exists, do not run the corresponding `CREATE` command again.

### 4. Configure environment variables

Create `backend/.env` using values for your local setup:

```env
DATABASE_URL="postgresql://mini_ledger_user:URL_ENCODED_PASSWORD@localhost:5432/miniledger?schema=public"
JWT_SECRET="replace_with_a_long_random_secret"
PORT=5000
```

Replace the placeholder password and JWT secret with private values. URL-encode special characters in the password when placing it in the connection URL (for example, `@` becomes `%40` and `%` becomes `%25`). Do not commit `.env` or real credentials.

### 5. Apply migrations and generate Prisma Client

From the `backend/` directory:

```bash
npx prisma migrate deploy
npx prisma generate
```

`migrate deploy` applies migration files that already exist in `prisma/migrations/`. If no initial migration has been created yet, create one during development after checking that the schema and database URL are configured:

```bash
npx prisma migrate dev --name init
npx prisma generate
```

Commit the resulting migration files so other environments can apply them.

### 6. Start the backend

```bash
npm run dev
```

The API is expected at `http://localhost:5000`.

### 7. Verify the API

Open `http://localhost:5000/api/health`.

Expected response:

```json
{
  "status": "ok",
  "message": "MiniLedger API is running"
}
```

This is the documented expected response; the actual response depends on the implementation currently in the repository.

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Check API status |
| POST | `/api/auth/send-otp` | Generate a mock OTP |
| POST | `/api/auth/verify-otp` | Verify OTP and obtain an access token |
| GET | `/api/loans` | List the authenticated user's loans |
| POST | `/api/loans` | Create a loan |
| PATCH | `/api/loans/:id/repay` | Mark a loan as repaid |
| GET | `/api/loans/summary` | Get loan totals and overdue amount |

All loan endpoints require a valid JWT access token.

### Authentication flow

1. Send a phone number to `POST /api/auth/send-otp`.
2. During development, retrieve the generated mock OTP from the backend terminal.
3. Submit the phone number and OTP to `POST /api/auth/verify-otp`.
4. Include the returned token in protected requests:

```http
Authorization: Bearer YOUR_ACCESS_TOKEN
```

### Example: create a loan

`POST /api/loans`

```json
{
  "friendName": "Rahul",
  "amount": "1500.00",
  "dueDate": "2026-10-22"
}
```

Include the JWT authorization header. The due date and amount are illustrative.

### Example: loan summary

`GET /api/loans/summary`

Illustrative response:

```json
{
  "totalLent": "1500",
  "totalRepaid": "0",
  "overdueAmount": "1500",
  "outstandingAmount": "1500.00"
}
```

Actual totals depend on the authenticated user's loan records and their repayment status.

## Mobile App (Expo)

The mobile project lives in `mobile/`.

```bash
cd mobile
npm install
npx expo start
```

Use the Expo CLI prompts to open the app on a simulator, an emulator, or a compatible device. The mobile app is a work in progress; screens and backend integration may not yet cover every feature listed above.

When connecting a physical device to a locally running backend, `localhost` refers to the device itself. Use your development computer's reachable LAN IP address for the API URL, and keep the phone and computer on the same network.

## Business Rules

- Loan amounts must be greater than zero.
- Each loan belongs to one user.
- Users should access only their own loan entries.
- A loan is overdue when it is unpaid and its due date has passed.
- Marking a loan as repaid records its repayment timestamp.
- The summary separates total lent, total repaid, overdue amount, and outstanding balance.

## Security and Limitations

- OTP delivery is mocked; codes are printed in backend logs rather than sent by SMS.
- OTPs are kept in memory and are lost when the server restarts.
- JWTs protect loan endpoints.
- Before production use, add robust OTP expiry and rate limiting, persistent OTP handling, secure secret management, and appropriate monitoring.
- Keep `.env` files, passwords, tokens, and dependency folders out of Git.

## Author

**Parth Mishra**

- GitHub: [Ptmishra69](https://github.com/Ptmishra69)
- LinkedIn: [Parth Mishra](https://www.linkedin.com/in/parth-mishra-57334a286)
