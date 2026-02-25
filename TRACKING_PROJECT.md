# Issues

1. If while enrolling in course if email send failed it, return success as false but the user enrollment save in database even with success false (after failed to send email) -> []

---

# Temporary changes made to code

1. In `controllers/enrollment.controller.js` named file, specificially in `enrollInBatch` controller sending email to student is comment out - due to it failure to send email, which block the successfully enrollment response to return

---

# Things that need to implement / change

1. Downloading and preview of learning material
2. Add the sign-in with google for user
3. Add Email template controlled to admin, superAdmin - CRUD operation on email template