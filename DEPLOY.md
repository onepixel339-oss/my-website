# دليل نشر Message in a Bottle — Vercel + Supabase (مجاني 100%)

> الهدف: موقعك يكون أونلاين على رابط عام (زي `my-bottle-app.vercel.app`) من غير أي تكلفة.

---

## قبل ما تبدأ

تحتاج:
- حساب **GitHub** (لو معندكش، اعمل واحد من github.com — مجاني)
- حساب **Vercel** (هنعمله بالـ GitHub — مجاني)
- حساب **Supabase** (هنعمله بإيميل — مجاني)
- **مفيش بطاقة ائتمان مطلوبة في أي خطوة**

---

## الخطوة 1 — ارفع المشروع على GitHub

1. فك ضغط ملف `message-in-a-bottle.tar.gz` اللي حملته في فولدر على جهازك.
2. افتح المجلد من الـ terminal:
   ```bash
   cd message-in-a-bottle
   git init
   git add .
   git commit -m "first commit"
   ```
3. ادخل على github.com → اضغط **New repository**:
   - اسم: `message-in-a-bottle` (أو أي اسم)
   - اختار **Private** أو **Public** (زي ما تحب)
   - متعملش `README` ولا `.gitignore` (عندنا واحد جاهز)
   - اضغط **Create repository**
4. انسخ الأوامر اللي هتظهرلك تحت "…or push an existing repository":
   ```bash
   git remote add origin https://github.com/USERNAME/message-in-a-bottle.git
   git branch -M main
   git push -u origin main
   ```

---

## الخطوة 2 — اعمل قاعدة بيانات على Supabase

1. ادخل على **supabase.com** → اضغط **Start your project** → سجّل بالإيميل أو GitHub.
2. اضغط **New project**:
   - **Name**: `bottle-db` (أو أي اسم)
   - **Database Password**: اكتب باسورد قوي **واكتبه في مكان عندك** (هتحتاجه)
   - **Region**: اختار الأقرب ليك (لو في مصر/الشرق الأوسط → `Frankfurt` أو `London`)
   - اضغط **Create new project** (هياخد دقيقتين بالظبط)
3. لما المشروع يخلص، ادخل على:
   **Project Settings** (آخر أيقونة في اليمين) → **Database**
4. تحت **Connection string**، هتلاقي حاجة شكلها كده:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.abcdefgh.supabase.co:5432/postgres
   ```
   دي **رابط الاتصال المباشر** (Direct URL). انسخه وبدّل `[YOUR-PASSWORD]` بالباسورد اللي كتبته.

5. انزل شوية لتحت تحت **Connection pooling** هتلاقي:
   ```
   postgresql://postgres.abcdefgh:[YOUR-PASSWORD]@aws-0-region.pooler.supabase.com:6543/postgres
   ```
   دي **رابط الـ Pooler** (للتطبيق). انسخه كمان وبدّل الباسورد.

> **مهم:** احتفظ بالرابطين دول في مكان آمن عندك.

---

## الخطوة 3 — اعمل ملف `.env` محلي

في فولدر المشروع عندك، اعمل ملف اسمه `.env` (بالظبط كده، من غير اسم قبله) واكتب فيه:

```bash
DATABASE_URL="ضع_هنا_رابط_الـ_Pooler_اللي_ينتهي_بـ_:6543"
DIRECT_URL="ضع_هنا_رابط_المباشر_اللي_ينتهي_بـ_:5432"
```

مثال (شكلهم بعد التعبيه):
```bash
DATABASE_URL="postgresql://postgres.abc123:mypassword@aws-0-frankfurt.pooler.supabase.com:6543/postgres"
DIRECT_URL="postgresql://postgres:mypassword@db.abc123.supabase.co:5432/postgres"
```

---

## الخطوة 4 — أنشئ الجداول في قاعدة البيانات

افتح terminal في فولدر المشروع وشغّل:

```bash
bun install
bun run db:push
```

هتظهرلك رسالة بتقول إنه هيعمل جداول جديدة — اكتب `y` وادخل Enter.

لو كل حاجة تمام، هتشوف رسالة "Your database is now in sync with your Prisma schema".

---

## الخطوة 5 — (اختياري) فعّل حماية الـ bot

ده اختياري — التطبيق يشتغل من غيره تمام. لو حبيت تفعّله بعدين، شوف التعليقات في `.env.example`.

---

## الخطوة 6 — انشر على Vercel

1. ادخل على **vercel.com** → اضغط **Sign Up** → اختار **Continue with GitHub**.
2. اضغط **Add New...** → **Project**.
3. تحت "Import Git Repository"، هتلاقي مستودع `message-in-a-bottle` — اضغط **Import**.
4. **مهم جداً:** قبل ما تضغط Deploy، انزل لتحت تحت **Environment Variables** وضيف المتغيرين دول:

   | Name | Value |
   |------|-------|
   | `DATABASE_URL` | رابط الـ Pooler (اللي ينتهي بـ `:6543`) |
   | `DIRECT_URL` | الرابط المباشر (اللي ينتهي بـ `:5432`) |

   - اكتب الاسم في خانة **Name**، والقيمة في خانة **Value**، واضغط **Add**.
   - كرر للمتغير التاني.

5. اضغط **Deploy** (هياخد حوالي 2-3 دقايق).

6. لما يخلص، هتلاقي رابط موقعك فوق: زي `message-in-a-bottle.vercel.app`.

> **مبارك! موقعك أونلاين.** 🎉 اضغط الرابط وجرب تكتب رسالة.

---

## لو ظهرت مشكلة

### "Database connection error"
- اتأكد إن `DATABASE_URL` و `DIRECT_URL` صح في Vercel (Project → Settings → Environment Variables).
- اتأكد إن الباسورد في الرابط صح.
- امسح الكاش: Vercel → Deployments → آخر deploy → **Redeploy**.

### الموقع بيفتح بس مفيش رسايل
- ده طبيعي! القاعدة فاضية. اكتب أول رسالة بنفسك وهي تظهر.

### عايز أحدثّ الكود
- عدّل على جهازك → `git push` → Vercel هيعمل deploy أوتوماتيك.

### عايز أغير اسم الموقع (الـ URL)
- Vercel → Project → Settings → **Domains** → اضف domain بتاعك أو غيّر الـ subdomain.

---

## ملخص سريع (لما تحب تراجع)

```
GitHub (الكود)  →  Vercel (النشر)  →  Supabase (القاعدة)
         ↓                ↓                    ↓
    git push         auto-deploy         DATABASE_URL
```

- **GitHub**: بيخزن الكود.
- **Vercel**: بيشغّل الموقع لما حد يزوره.
- **Supabase**: بتخزن الرسايل والتفاعلات.

التلاتة مجانيين للأبد للمشاريع الشخصية. الـ Vercel بيدعم حركة زيارة كبيرة جداً على الـ free plan (100GB شهرياً).
