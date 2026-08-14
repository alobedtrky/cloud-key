# Cloud Key Store V5

متجر رقمي عربي متكامل مبني بـ Node.js مع حسابات Firebase، إدارة منتجات وطلبات، محرر متجر، SEO، تقييمات، دفع Moyasar اختياري، وتخزين PostgreSQL مشفر اختياري.

## التشغيل
```bash
npm install
npm start
```

## إعدادات الإنتاج الأساسية
اضبط في Render:
- `NODE_ENV=production`
- `ADMIN_USER`
- `ADMIN_PASSWORD` بطول 12 حرفًا أو أكثر
- `SESSION_SECRET` بطول 32 حرفًا أو أكثر

## قاعدة بيانات دائمة
أنشئ PostgreSQL وأضف:
- `DATABASE_URL`
- `DATA_ENCRYPTION_KEY` بطول 32 حرفًا أو أكثر
- `PGSSL=require`

عند وجود `DATABASE_URL` ينتقل المتجر تلقائيًا إلى PostgreSQL. يتم تخزين حالة المتجر كحمولة مشفرة AES-256-GCM، مع استمرار ملف محلي كنسخة تشغيلية مساعدة.

## Firebase
أضف متغيرات Firebase المعتادة:
- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`

## Moyasar
للدفع الإلكتروني أضف:
- `MOYASAR_PUBLISHABLE_KEY`
- `MOYASAR_SECRET_KEY`
- `MOYASAR_WEBHOOK_SECRET`
- `MOYASAR_STC_PAY=true` اختياري
- `MOYASAR_APPLE_PAY=true` اختياري بعد إعداد نطاق Apple Pay

Webhook المقترح:
```text
https://YOUR-DOMAIN/api/payment/webhook
```

## الصفحات
- `/` المتجر
- `/checkout` إتمام الطلب
- `/profile` حساب العميل وطلباته
- `/admin` لوحة الإدارة
- `/privacy` الخصوصية
- `/terms` الشروط
- `/refunds` سياسة الاسترجاع
- `/contact` التواصل
- `/about` من نحن

## الحماية
المشروع يستخدم HTTPS على الاستضافة، CSP، HSTS، SameSite/HttpOnly cookies، rate limiting، origin checks، تحقق Firebase للطلبات، تحقق دفع من الخادم، سجل نشاط الإدارة، وتشفير بيانات PostgreSQL عند تفعيله.
