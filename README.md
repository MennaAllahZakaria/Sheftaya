# Sheftaya Platform

Sheftaya is a comprehensive platform designed to connect employers with workers for short-term shifts and jobs. It provides real-time tracking, secure payments, and a robust notification system to ensure a seamless experience for both parties.

## Key Features

- **Real-time Shift Management**: Track worker arrival, shift progress, and completion via Socket.io.
- **Job Posting & Application**: Employers can post jobs, and workers can apply based on skills and location.
- **Secure Payments**: Escrow-based payment system to protect both employers and workers.
- **Identity Verification**: Built-in verification process for all users.
- **AI-Powered Recommendations**: Jobs are recommended to workers based on their profiles and history.
- **Multi-day Support**: Robust logic to handle jobs that span multiple days.

## Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: MongoDB (Mongoose ODM)
- **Real-time**: Socket.io
- **Authentication**: JWT (JSON Web Tokens)
- **File Storage**: Cloudinary (via Multer)
- **Notifications**: Firebase Cloud Messaging (FCM)
- **Task Scheduling**: Node-cron

## Project Structure

```text
Sheftaya/
├── config/             # Configuration files (Database, Socket.io, Cloudinary)
├── controllers/        # Request handlers
├── middleware/         # Custom Express middleware (Auth, Error handling, Uploads)
├── models/             # Mongoose schemas
├── routes/             # API route definitions
├── services/           # Business logic (Shifts, Jobs, Notifications)
├── utils/              # Helper functions and validators
└── README.md           # Project documentation
```

## API Endpoints Overview

The platform is organized into several modules:

| Module             | Description |
|--------------------|-------------|
| `/auth`            | User registration, login, and password management. |
| `/users`           | Profile management and identity verification. |
| `/jobs`            | Job creation, updates, and listing. |
| `/applications`    | Managing worker applications to jobs. |
| `/shifts`          | Real-time shift tracking (On the way, Arrived, etc.). |
| `/notifications`   | Retrieval and management of user notifications. |
| `/chat`            | Real-time messaging between workers and employers. |

## Socket.io Events and Real-time Communication

Socket.io is used for real-time updates. Each user is automatically joined to a room named `user:{userId}` and a job-specific room `job:{jobId}` when they join a chat or shift tracking.

### Server-to-Client Events (Emitted by Server)

| Event Name | Room / Target | Payload | Description |
|------------|---------------|---------|-------------|
| `worker_on_the_way` | `job:{jobId}` | `{ appId, workerId, status: "on_the_way", time }` | Worker started moving to job |
| `worker_arrived` | `job:{jobId}` | `{ appId, workerId, status: "arrived", time }` | Worker reached job location |
| `arrival_approved` | `user:{workerId}` | `{ appId, status: "arrived_approved", time }` | Employer confirmed worker arrival |
| `shift_started` | `user:{workerId}` | `{ appId, status: "in_progress", time }` | Employer started the shift |
| `shift_completed` | `user:{workerId}` | `{ appId, status: "completed", time }` | Employer marked shift as done |
| `new_message` | `job:{jobId}` | `{ _id, sender, text, createdAt }` | New message in job chat |

### Client-to-Server Events (Emitted by Client)

| Event Name | Payload | Description |
|------------|---------|-------------|
| `join_job` | `{ jobId }` | Join a specific job room for updates/chat |
| `leave_job` | `{ jobId }` | Leave a specific job room |
| `pingCheck` | - | Connectivity check (responds with `pongCheck`) |

## Installation & Setup

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/MennaAllahZakaria/Sheftaya.git
    cd Sheftaya
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Set up environment variables**:
    Create a `.env` file in the root directory and add the following:
    ```env
    PORT=3000
    DB_URI=your_mongodb_uri
    JWT_SECRET=your_jwt_secret
    CLOUDINARY_CLOUD_NAME=...
    CLOUDINARY_API_KEY=...
    CLOUDINARY_API_SECRET=...
    ```

4.  **Run the application**:
    ```bash
    npm start
    ```

## Development

-   **Linting**: The project follows standard JS coding styles.
-   **Validation**: All inputs are validated using `express-validator`.
-   **Error Handling**: Centralized error handling via `ApiError` and `asyncHandler`.
