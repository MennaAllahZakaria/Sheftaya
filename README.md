# Sheftaya - Backend API

## نظرة عامة على المشروع
مشروع Sheftaya هو نظام لإدارة الوظائف والورديات (Shifts) يربط بين أصحاب العمل والعمال. يوفر المشروع واجهة خلفية (Backend API) قوية تدعم عمليات التقديم على الوظائف، إدارة الورديات، نظام إشعارات، وتتبع حالة العمال في الورديات المختلفة. تم بناء المشروع باستخدام Node.js و Express.js مع MongoDB كقاعدة بيانات، ويستخدم Socket.io للتواصل الفوري.

## الميزات الرئيسية
- **إدارة المستخدمين**: تسجيل الدخول، التسجيل، إدارة الأدوار (عامل/صاحب عمل).
- **إدارة الوظائف**: إنشاء، تعديل، حذف، والبحث عن الوظائف.
- **التقديم على الوظائف**: نظام تقديم وقبول/رفض العمال.
- **إدارة الورديات**: تتبع حالة العامل (في الطريق، وصل، تم الموافقة على الوصول، بدأ الوردية، انتهت الوردية).
- **إشعارات فورية**: باستخدام Socket.io و Firebase Cloud Messaging (FCM).
- **نظام تقارير ودعم فني**.
- **نظام عقوبات**.

## التقنيات المستخدمة
- **Node.js**: بيئة تشغيل JavaScript.
- **Express.js**: إطار عمل (Framework) لتطوير الـ APIs.
- **MongoDB**: قاعدة بيانات NoSQL.
- **Mongoose**: مكتبة لنمذجة البيانات (ODM) لـ MongoDB.
- **Socket.io**: مكتبة للتواصل في الوقت الفعلي (Real-time communication).
- **Firebase Admin SDK**: لإرسال إشعارات FCM.
- **JWT**: للمصادقة (Authentication).
- **Bcrypt**: لتشفير كلمات المرور.
- **Cloudinary**: لإدارة ورفع الصور.
- **Nodemailer**: لإرسال رسائل البريد الإلكتروني.
- **Node-cron**: لجدولة المهام.

## الإعداد والتشغيل

### المتطلبات الأساسية
- Node.js (v18 أو أحدث)
- MongoDB (مثبت محليًا أو خدمة سحابية مثل MongoDB Atlas)
- حساب Cloudinary
- حساب Firebase مع إعداد FCM

### تثبيت التبعيات
```bash
npm install
```

### ملفات البيئة (Environment Variables)
قم بإنشاء ملف `.env` في الجذر الرئيسي للمشروع واملأه بالمتغيرات التالية:

```
PORT=5000
NODE_ENV=development
DB_URI=mongodb://localhost:27017/sheftaya
JWT_SECRET_KEY=your_jwt_secret_key
JWT_EXPIRE_TIME=30d
JWT_COOKIE_EXPIRE=30

CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

EMAIL_USER=your_email@example.com
EMAIL_PASS=your_email_password

FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_PRIVATE_KEY_ID=your_firebase_private_key_id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=your_firebase_client_email

AI_API_KEY=your_ai_api_key
```

### تشغيل المشروع

للتشغيل في وضع التطوير (Development):
```bash
npm run dev
```

للتشغيل في وضع الإنتاج (Production):
```bash
npm run start:prod
```

## مسارات الـ API الرئيسية (API Endpoints)

| المسار (Endpoint)           | الوصف                                      |
| :-------------------------- | :----------------------------------------- |
| `/auth`                     | مصادقة المستخدمين وإدارة الحسابات         |
| `/admin`                    | إدارة المستخدمين والوظائف بواسطة المسؤول   |
| `/jobs`                     | إدارة الوظائف (إنشاء، عرض، تعديل، حذف)     |
| `/applications`             | التقديم على الوظائف وإدارة طلبات التقديم   |
| `/shifts`                   | إدارة حالة الورديات للعمال                 |
| `/notifications`            | إدارة وعرض الإشعارات للمستخدمين           |
| `/support`                  | نظام الدعم الفني                           |
| `/reports`                  | نظام الإبلاغ عن المشاكل                   |
| `/reviews`                  | تقييمات الوظائف والعمال                   |
| `/cornJobs`                 | مسارات لتشغيل مهام مجدولة (مثل الإشعارات) |

## أحداث Socket.io وإدارة الورديات

تم تحسين نظام إدارة الورديات ليكون أكثر تفاعلية ودعمًا للوظائف متعددة الأيام، مع استخدام Socket.io لإرسال تحديثات فورية.

### تدفق حالة الوردية (Shift Status Flow)
1.  **`onTheWay`**: العامل في طريقه إلى موقع العمل.
    -   يتم إرسال حدث Socket.io `worker_on_the_way` إلى غرفة الوظيفة (`jobId`).
    -   يتم إرسال إشعار فوري لصاحب العمل.
2.  **`arrive`**: العامل وصل إلى موقع العمل.
    -   يتم إرسال حدث Socket.io `worker_arrived` إلى غرفة الوظيفة (`jobId`).
    -   يتم إرسال إشعار فوري لصاحب العمل.
3.  **`approveArrival`**: صاحب العمل يوافق على وصول العامل.
    -   يتم إرسال حدث Socket.io `arrival_approved` إلى غرفة العامل (`workerId`).
    -   يتم إرسال إشعار فوري للعامل.
4.  **`startShift`**: صاحب العمل يبدأ الوردية للعامل.
    -   يتم إرسال حدث Socket.io `shift_started` إلى غرفة العامل (`workerId`).
    -   يتم إرسال إشعار فوري للعامل.
5.  **`endShift`**: صاحب العمل ينهي الوردية للعامل.
    -   يتم إرسال حدث Socket.io `shift_completed` إلى غرفة العامل (`workerId`).
    -   يتم إرسال إشعار فوري للعامل.

### حل مشكلة الورديات متعددة الأيام
تم تعديل منطق `shiftService.js` للسماح للعامل ببدء حالة "On the way" أو "Arrive" حتى لو كانت حالة الوردية السابقة "Completed" (على سبيل المثال، في نهاية يوم عمل سابق في وظيفة متعددة الأيام). هذا يحل مشكلة الأخطاء التي كانت تحدث في اليوم الثاني للوظائف الطويلة.

تم تعطيل المسار القديم `/applications/:id/mark-arrival` في `applicationService.js` لتجنب التعارضات وضمان استخدام المسار الجديد القائم على Socket.io في `shiftService.js`.

## نظام الإشعارات

تم إصلاح وتحسين نظام الإشعارات لضمان إرسالها بشكل صحيح وفي الوقت المناسب.

-   **إصلاح `notificationService.js`**: تم تصحيح خطأ في دالة `sendNotificationNow` حيث كانت تستخدم متغير `token` غير معرف بدلاً من `user.fcmToken` لإرسال إشعارات FCM.
-   **إصلاح `notificationHandler.js`**: تم تصحيح خطأ في استدعاء دالة `scheduleNotification`.
-   **توحيد أنواع الإشعارات**: تم التأكد من أن جميع أنواع الإشعارات المستخدمة تتوافق مع الـ `enum` المعرف في `notificationModel.js`.

## المساهمة
نرحب بالمساهمات! يرجى قراءة [CONTRIBUTING.md](CONTRIBUTING.md) للحصول على إرشادات حول كيفية المساهمة في المشروع.

## الترخيص
هذا المشروع مرخص تحت ترخيص ISC. انظر ملف [LICENSE](LICENSE) لمزيد من التفاصيل.

---

# Sheftaya - Backend API

## Project Overview
Sheftaya is a job and shift management system that connects employers and workers. This project provides a robust Backend API that supports job application processes, shift management, a notification system, and tracking worker status across different shifts. The project is built using Node.js and Express.js with MongoDB as the database, and utilizes Socket.io for real-time communication.

## Key Features
-   **User Management**: Login, registration, role management (worker/employer).
-   **Job Management**: Create, update, delete, and search for jobs.
-   **Job Applications**: Application system for workers and acceptance/rejection by employers.
-   **Shift Management**: Track worker status (on the way, arrived, arrival approved, shift started, shift ended).
-   **Real-time Notifications**: Using Socket.io and Firebase Cloud Messaging (FCM).
-   **Reporting and Support System**.
-   **Penalty System**.

## Technologies Used
-   **Node.js**: JavaScript runtime environment.
-   **Express.js**: Framework for building APIs.
-   **MongoDB**: NoSQL database.
-   **Mongoose**: Object Data Modeling (ODM) library for MongoDB.
-   **Socket.io**: Library for real-time communication.
-   **Firebase Admin SDK**: For sending FCM notifications.
-   **JWT**: For authentication.
-   **Bcrypt**: For password hashing.
-   **Cloudinary**: For image management and uploads.
-   **Nodemailer**: For sending emails.
-   **Node-cron**: For scheduling tasks.

## Setup and Installation

### Prerequisites
-   Node.js (v18 or newer)
-   MongoDB (locally installed or a cloud service like MongoDB Atlas)
-   Cloudinary account
-   Firebase account with FCM setup

### Install Dependencies
```bash
npm install
```

### Environment Variables
Create a `.env` file in the project root and populate it with the following variables:

```
PORT=5000
NODE_ENV=development
DB_URI=mongodb://localhost:27017/sheftaya
JWT_SECRET_KEY=your_jwt_secret_key
JWT_EXPIRE_TIME=30d
JWT_COOKIE_EXPIRE=30

CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

EMAIL_USER=your_email@example.com
EMAIL_PASS=your_email_password

FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_PRIVATE_KEY_ID=your_firebase_private_key_id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=your_firebase_client_email

AI_API_KEY=your_ai_api_key
```

### Running the Project

For development mode:
```bash
npm run dev
```

For production mode:
```bash
npm run start:prod
```

## Main API Endpoints

| Endpoint                    | Description                               |
| :-------------------------- | :---------------------------------------- |
| `/auth`                     | User authentication and account management |
| `/admin`                    | User and job management by administrators |
| `/jobs`                     | Job management (create, view, update, delete) |
| `/applications`             | Job applications and application management |
| `/shifts`                   | Worker shift status management            |
| `/notifications`            | Manage and view user notifications        |
| `/support`                  | Technical support system                  |
| `/reports`                  | Issue reporting system                    |
| `/reviews`                  | Job and worker reviews                    |
| `/cornJobs`                 | Endpoints for scheduled tasks (e.g., notifications) |

## Socket.io Events and Shift Management

The shift management system has been enhanced to be more interactive and supportive of multi-day jobs, utilizing Socket.io for real-time updates.

### Shift Status Flow
1.  **`onTheWay`**: Worker is en route to the job site.
    -   A `worker_on_the_way` Socket.io event is emitted to the job room (`jobId`).
    -   An instant notification is sent to the employer.
2.  **`arrive`**: Worker has arrived at the job site.
    -   A `worker_arrived` Socket.io event is emitted to the job room (`jobId`).
    -   An instant notification is sent to the employer.
3.  **`approveArrival`**: Employer approves the worker's arrival.
    -   An `arrival_approved` Socket.io event is emitted to the worker's room (`workerId`).
    -   An instant notification is sent to the worker.
4.  **`startShift`**: Employer starts the shift for the worker.
    -   A `shift_started` Socket.io event is emitted to the worker's room (`workerId`).
    -   An instant notification is sent to the worker.
5.  **`endShift`**: Employer ends the shift for the worker.
    -   A `shift_completed` Socket.io event is emitted to the worker's room (`workerId`).
    -   An instant notification is sent to the worker.

### Multi-day Shift Issue Resolution
The logic in `shiftService.js` has been modified to allow a worker to initiate the "On the way" or "Arrive" status even if the previous shift status was "Completed" (e.g., at the end of a previous workday in a multi-day job). This resolves the errors that were occurring on the second day of long-term jobs.

The old route `/applications/:id/mark-arrival` in `applicationService.js` has been deprecated to avoid conflicts and ensure the use of the new Socket.io-based path in `shiftService.js`.

## Notification System

The notification system has been fixed and improved to ensure correct and timely delivery.

-   **`notificationService.js` Fix**: Corrected an error in the `sendNotificationNow` function where an undefined `token` variable was used instead of `user.fcmToken` for sending FCM notifications.
-   **`notificationHandler.js` Fix**: Corrected an error in calling the `scheduleNotification` function.
-   **Unified Notification Types**: Ensured that all used notification types conform to the `enum` defined in `notificationModel.js`.

## Contributing
Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute to the project.

## License
This project is licensed under the ISC License. See the [LICENSE](LICENSE) file for more details.
