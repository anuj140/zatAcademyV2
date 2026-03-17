```js
exports.getAllTemplates = async (req, res) => {
  try {
    //1. Extract category and isActive from query
    const { category, isActive } = req.query;
    //2. Create filter obj
    const filter = {};

    //3. If there is value passed in category then create new property called 'category' and assign whatever value passed in category query
    if (category) filter.category = category;
    //4. If isActive is not undefined (means value is provided) then create property called isActive set the value if true if isActive value is provided to true (by checking isActive is set to string true)
    if (isActive !== undefined) filter.isActive = isActive === "true"; ///??
    //5. Find the documents based on whatever save in filter object
    // - exclude htmlBody, sort by - category slug,
    // - populate createdBy, updatedBy - name, email
    const templates = await EmailTemplate.find(filter)
      .select("-htmlBody") // exclude body in list view for brevity
      .sort("category slug")
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");

    //6. Send response (status ok), with result length and actual data (templates)
    res.status(200).json({
      success: true,
      count: templates.length,
      data: templates,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
```

```js
exports.getTemplate = async (req, res) => {
  try {
    //1. Find the email template by slug (params)
    // - populate createdBy, updatedBy - name, email
    const template = await EmailTemplate.findOne({ slug: req.params.slug })
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");
    //2. If no emailTemplate found
    if (!template) {
      // Show default if it exists
      //2.1 Get default template (saved in code)
      const defaultTpl = DEFAULTS[req.params.slug];
      //2.2 If default template found
      if (defaultTpl) {
        //2.3 Return (status ok) with source mentioed
        // - query slug, defalut subject, htmlBody and isActive (set to true)
        return res.status(200).json({
          success: true,
          source: "default",
          data: {
            slug: req.params.slug,
            subject: defaultTpl.subject,
            htmlBody: defaultTpl.htmlBody,
            isActive: true,
          },
        });
      }
      //2.4. If no default template found return message "Template not found"
      return res.status(404).json({ success: false, message: "Template not found" });
    }
    //4. Return (status ok) mentioed source database, actual  template
    res.status(200).json({ success: true, source: "database", data: template });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
```

```js
async function renderTemplate(slug, vars = {}) {
  //1. Save default template of provide slug (as argument)
  const fallback = DEFAULTS[slug];

  try {
    //2. Find one emailTemplate with provided slug and isActive is set to true
    const dbTemplate = await EmailTemplate.findOne({ slug, isActive: true });
    //3. If there template in DB otherwise use fallback
    const tpl = dbTemplate || fallback;
    //4. If no template
    if (!tpl) {
      //4.1 console log about no template found for slug
      console.warn(`[templateService] No template found for slug: ${slug}`);
      //4.2 Return empty string value for subject and html
      return { subject: "", html: "" };
    }

    //a) Replace subject (in email) with variable (actual value)
    const subject = interpolate(tpl.subject, vars);
    //b) Replace email body with variable (actual value)
    const html = interpolate(tpl.htmlBody, vars);
    //c) Return subject and html
    return { subject, html };
  } catch (err) {
    //4. Log error while fetching template
    console.error(`[templateService] Error fetching template "${slug}":`, err.message);
    // Fall back to hardcoded default on DB
    // 5. If no template found in DB retrun replace placeholder for subject and emailBody
    if (fallback) {
      return {
        subject: interpolate(fallback.subject, vars),
        html: interpolate(fallback.htmlBody, vars),
      };
    }
    return { subject: "", html: "" };
  }
}
```

```js
const sendEmail = async (options) => {
  // Create msg (message) object with to map value in option
  //    such as - to, from, subject, text, html
  const msg = {
    to: options.email,
    from: process.env.EMAIL_FROM,
    subject: options.subject,
    text: options.message,
    html: options.html,
  };

  try {
    //2. Pass msg obj in send method of sendGrid
    await sgMail.send(msg);
    //3. Log email sent successfully
    console.log("Email sent successfully");
  } catch (error) {
    //4. Otherwise log error send method
    //5. Throw custom error "email could not be sent"
    console.error("Error sending email:", error);
    throw new Error("Email could not be sent");
  }
};
```

```js
// sendPasswordResetEmail take user and resetToken
const sendPasswordResetEmail = async (user, resetToken) => {
  //1. Construct the url for resetToken by attaching resetToken
  const resetURL = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

  //2. Pass user name and resetUrl in renderTemplate fn (which replace placeholder with actual value) and then extract replace holder content 'subject and body'
  const { subject, html } = await renderTemplate("password_reset", {
    userName: user.name,
    resetURL,
  });
  //3. Pass argument in sendEmail function such as user.email, replace placeholder subject and html
  await sendEmail({ email: user.email, subject, html });
};
```

```js
exports.updateTemplate = async (req, res) => {
  try {
    //1. Define editable fields in array called 'allowFields'
    const allowedFields = [
      "name",
      "subject",
      "htmlBody",
      "variables",
      "category",
      "isActive",
    ];
    //2. Create empty updates obj
    const updates = {};
    //3. Iterate over each element (field) of allowedField
    //    - if that filed value is provided (by user) then create property by that field name (that is present in allowedField) and set value to whatever user provided
    //    - Create updatedBy property and save current login user id
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });
    updates.updatedBy = req.user.id;
    //4. Find the one emailTemplate to by slug (unique identifier), update obj and run mongoose validator
    const template = await EmailTemplate.findOneAndUpdate(
      { slug: req.params.slug },
      updates,
      { new: true, runValidators: true },
    );
    //5. If template not found
    //    - return (status not found) with message 'template not found'
    if (!template) {
      return res.status(404).json({ success: false, message: "Template not found" });
    }
    //6. If found (status ok) with message 'template updated successfully' and return the updated template
    res
      .status(200)
      .json({ success: true, message: "Template updated successfully", data: template });
  } catch (error) {
    //7. Return response (status Internal server error) with error message
    res.status(500).json({ success: false, message: error.message });
  }
};
```

## PreviewTemplate controller function

```js
exports.previewTemplate = async (req, res) => {
  try {
    //1. Extract variables (set default to empty object) from user input
    const { variables = {} } = req.body;
    const { interpolate } = require("../utils/templateService");

    // Fetch from DB first, then fall back to default
    //2. Find the one emailTemplate from provided slug in params (as id)
    let tpl = await EmailTemplate.findOne({ slug: req.params.slug });
    //3. If there is no template
    if (!tpl) {
      //3.1 Search in default template by provided slug
      const defaultTpl = DEFAULTS[req.params.slug];
      //3.2 If there is no default template
      if (!defaultTpl) {
        //3.3 Return the (not found) with message 'template not found'
        return res.status(404).json({ success: false, message: "Template not found" });
      }
      //3.3 Set tpl variable to default template result
      tpl = defaultTpl;
    }
    //4.  Replace the placeholder with value for subject and htmlBody
    const subject = interpolate(tpl.subject, variables);
    const html = interpolate(tpl.htmlBody, variables);

    //5. Find return (ok status) with subject and html
    res.status(200).json({
      success: true,
      data: { subject, html },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
```

# listDefaults endpoint

```js
exports.listDefaults = async (req, res) => {
  try {
    //1. Iterate over default template slug
    //    - return slug, subject and source (default template present in database)
    const defaults = Object.keys(DEFAULTS).map((slug) => ({
      slug,
      subject: DEFAULTS[slug].subject,
      inDatabase: false, // will be updated below
    }));
    //2. Get unique slug (emailTemplate name)
    const dbSlugs = await EmailTemplate.distinct("slug");
    //3. Remove any duplicate
    const dbSlugSet = new Set(dbSlugs);
    //4. Iterate over default (emailTemplate)
    //    - and check if document has slug property
    defaults.forEach((d) => {
      d.inDatabase = dbSlugSet.has(d.slug);
    });
    //5. Return (status ok) with result length and emailTemplate
    res.status(200).json({ success: true, count: defaults.length, data: defaults });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
```

## Seed script

```js
/**
 * Seed script — upserts all 12 system default email templates to MongoDB.
 * Run once: node src/script/seedEmailTemplates.js
 */

//1. Access or loading .env file
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });
const mongoose = require("mongoose");
const EmailTemplate = require("../models/EmailTemplate");
const { DEFAULTS } = require("../utils/templateService");

const TEMPLATE_META = {
  enrollment_initiated: {
    name: "Enrollment Initiated",
    category: "enrollment",
    variables: [
      "userName",
      "courseTitle",
      "batchName",
      "totalAmount",
      "paymentMethodLabel",
      "firstPaymentAmount",
    ],
  },
  payment_success: {
    name: "Payment Successful",
    category: "payment",
    variables: [
      "userName",
      "amount",
      "courseTitle",
      "isFullyPaid",
      "paidAmount",
      "totalAmount",
      "dashboardUrl",
    ],
  },
  password_reset: {
    name: "Password Reset",
    category: "auth",
    variables: ["userName", "resetURL"],
  },
  welcome: {
    name: "Welcome Email",
    category: "auth",
    variables: ["userName", "tempPassword", "loginUrl"],
  },
  assignment_graded: {
    name: "Assignment Graded",
    category: "grade",
    variables: [
      "userName",
      "assignmentTitle",
      "marksObtained",
      "maxMarks",
      "percentage",
      "grade",
      "passStatus",
      "feedback",
      "submissionUrl",
    ],
  },
  final_grades_published: {
    name: "Final Grades Published",
    category: "grade",
    variables: [
      "userName",
      "courseTitle",
      "batchName",
      "overallPercentage",
      "finalGrade",
      "assignmentsCompleted",
      "assignmentsTotal",
      "gradesUrl",
    ],
  },
  assignment_created: {
    name: "New Assignment Created",
    category: "assignment",
    variables: [
      "userName",
      "batchName",
      "assignmentTitle",
      "deadline",
      "maxMarks",
      "passingMarks",
      "assignmentUrl",
    ],
  },
  assignment_published: {
    name: "Assignment Published",
    category: "assignment",
    variables: [
      "userName",
      "batchName",
      "assignmentTitle",
      "startDate",
      "deadline",
      "maxMarks",
      "assignmentUrl",
    ],
  },
  assignment_updated: {
    name: "Assignment Updated",
    category: "assignment",
    variables: [
      "userName",
      "batchName",
      "assignmentTitle",
      "deadline",
      "lateDeadline",
      "assignmentUrl",
    ],
  },
  doubt_created_instructor: {
    name: "New Doubt Notification (Instructor)",
    category: "doubt",
    variables: [
      "instructorName",
      "batchName",
      "doubtTitle",
      "studentName",
      "category",
      "postedAt",
      "doubtUrl",
    ],
  },
  doubt_resolved_student: {
    name: "Doubt Resolved (Student)",
    category: "doubt",
    variables: ["userName", "doubtTitle", "resolvedAt", "doubtUrl"],
  },
  doubt_reply_notification: {
    name: "Doubt Reply Notification",
    category: "doubt",
    variables: ["userName", "doubtTitle", "replyContext", "repliedBy", "doubtUrl"],
  },
};

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");

  let created = 0;
  let updated = 0;

  for (const [slug, defaultTpl] of Object.entries(DEFAULTS)) {
    const meta = TEMPLATE_META[slug] || { name: slug, category: "other", variables: [] };

    const result = await EmailTemplate.findOneAndUpdate(
      { slug },
      {
        $setOnInsert: {
          slug,
          name: meta.name,
          subject: defaultTpl.subject,
          htmlBody: defaultTpl.htmlBody,
          variables: meta.variables,
          category: meta.category,
          isActive: true,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    if (result.__v === 0 || result.isNew) {
      created++;
      console.log(`  ✅ Created: ${slug}`);
    } else {
      updated++;
      console.log(`  ⏭️  Already exists (skipped): ${slug}`);
    }
  }

  console.log(`\nSeeding complete — ${created} created, ${updated} already existed.`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("Seeder failed:", err);
  process.exit(1);
});
```

# Seed script

```js
/**
 * Seed script — upserts all 12 system default email templates to MongoDB.
 * Run once: node src/script/seedEmailTemplates.js
 */

//1. Locate .env file in this project
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });
const mongoose = require("mongoose");
//2. Locate emailTemplateSchema
const EmailTemplate = require("../models/EmailTemplate");
//3. Get default object (containing emailTemplate as obj)
const { DEFAULTS } = require("../utils/templateService");

//4. Define obj accoding to schema for emailTemplate  (to save in db)
const TEMPLATE_META = {
  enrollment_initiated: {
    name: "Enrollment Initiated",
    category: "enrollment",
    variables: [
      "userName",
      "courseTitle",
      "batchName",
      "totalAmount",
      "paymentMethodLabel",
      "firstPaymentAmount",
    ],
  },
  payment_success: {
    name: "Payment Successful",
    category: "payment",
    variables: [
      "userName",
      "amount",
      "courseTitle",
      "isFullyPaid",
      "paidAmount",
      "totalAmount",
      "dashboardUrl",
    ],
  },
  password_reset: {
    name: "Password Reset",
    category: "auth",
    variables: ["userName", "resetURL"],
  },
  welcome: {
    name: "Welcome Email",
    category: "auth",
    variables: ["userName", "tempPassword", "loginUrl"],
  },
  assignment_graded: {
    name: "Assignment Graded",
    category: "grade",
    variables: [
      "userName",
      "assignmentTitle",
      "marksObtained",
      "maxMarks",
      "percentage",
      "grade",
      "passStatus",
      "feedback",
      "submissionUrl",
    ],
  },
  final_grades_published: {
    name: "Final Grades Published",
    category: "grade",
    variables: [
      "userName",
      "courseTitle",
      "batchName",
      "overallPercentage",
      "finalGrade",
      "assignmentsCompleted",
      "assignmentsTotal",
      "gradesUrl",
    ],
  },
  assignment_created: {
    name: "New Assignment Created",
    category: "assignment",
    variables: [
      "userName",
      "batchName",
      "assignmentTitle",
      "deadline",
      "maxMarks",
      "passingMarks",
      "assignmentUrl",
    ],
  },
  assignment_published: {
    name: "Assignment Published",
    category: "assignment",
    variables: [
      "userName",
      "batchName",
      "assignmentTitle",
      "startDate",
      "deadline",
      "maxMarks",
      "assignmentUrl",
    ],
  },
  assignment_updated: {
    name: "Assignment Updated",
    category: "assignment",
    variables: [
      "userName",
      "batchName",
      "assignmentTitle",
      "deadline",
      "lateDeadline",
      "assignmentUrl",
    ],
  },
  doubt_created_instructor: {
    name: "New Doubt Notification (Instructor)",
    category: "doubt",
    variables: [
      "instructorName",
      "batchName",
      "doubtTitle",
      "studentName",
      "category",
      "postedAt",
      "doubtUrl",
    ],
  },
  doubt_resolved_student: {
    name: "Doubt Resolved (Student)",
    category: "doubt",
    variables: ["userName", "doubtTitle", "resolvedAt", "doubtUrl"],
  },
  doubt_reply_notification: {
    name: "Doubt Reply Notification",
    category: "doubt",
    variables: ["userName", "doubtTitle", "replyContext", "repliedBy", "doubtUrl"],
  },
};

async function seed() {
  //5. Connect to mongoDB
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB");
  //6. Initialize created variable to 0 (maybe acts counter)
  let created = 0;
  //7. Initialize created variable to 0 (maybe acts counter)
  let updated = 0;
  //8. Iterate over slug(Id) and set of properties of each object in DEFAULTS
  for (const [slug, defaultTpl] of Object.entries(DEFAULTS)) {
    //8.1 Save templateMeta in meta varible otherwise create object (name: slug, category: other, variable: [])
    const meta = TEMPLATE_META[slug] || { name: slug, category: "other", variables: [] };
    //8.2 Find the emailTemplate with slug(id), insert (if does not exist) - (slug, name, subject, htmlBody, variables, category, isActive)
    //    - option (if doc exist update otherwise insert, return new updated doc, set default value if not present)
    const result = await EmailTemplate.findOneAndUpdate(
      { slug },
      {
        $setOnInsert: {
          slug,
          name: meta.name,
          subject: defaultTpl.subject,
          htmlBody: defaultTpl.htmlBody,
          variables: meta.variables,
          category: meta.category,
          isActive: true,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    //8.3 If version of document is zero set OR result is new
    //  - increase count of created (by 1)
    //Else (if version is not zero OR result is not new)
    //  - Increase count of updated (by 1)
    if (result.__v === 0 || result.isNew) {
      created++;
      console.log(`  ✅ Created: ${slug}`);
    } else {
      updated++;
      console.log(`  ⏭️  Already exists (skipped): ${slug}`);
    }
  }
  //9. Log created and update count with message
  console.log(`\nSeeding complete — ${created} created, ${updated} already existed.`);
  //10. Disconnect the mongoDB connection
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("Seeder failed:", err);
  process.exit(1);
});
```

## Reply to dobut

```js
exports.replyToDoubt = async (req, res) => {
  try {
    //1. Extract id of an dobut from url
    const { id } = req.params;
    //2. Extract content (reply message)
    const { content } = req.body;
    //3. Find the doubt with an id
    const doubt = await Doubt.findById(id);
    //4. If there is no doubt
    //    - return success to false and message "doubt not found"
    if (!doubt) {
      return res.status(404).json({
        success: false,
        message: "Doubt not found",
      });
    }

    // Check if user can reply to this doubt
    const canReply = await canUserReplyToDoubt(req.user, doubt);
    if (!canReply) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to reply to this doubt",
      });
    }

    // Create reply
    //# Create reply object by extracting user id from req obj
    //    - content (whatever content user provided)
    //    - if user (login user role) is instructor set to true, (same goes for admin and superAdmin)
    const reply = {
      user: req.user.id,
      content,
      isInstructorReply:
        req.user.role === "instructor" ||
        req.user.role === "admin" ||
        req.user.role === "superAdmin",
    };

    // Handle attachments in reply
    //# If there files or files length is greater than zero
    if (req.files && req.files.length > 0) {
      //#.a Create new property called attachments and iterate over each file
      // - in that obj, set url or public id, original name and mimetype
      reply.attachments = req.files.map((file) => ({
        url: file.path,
        public_id: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
      }));
    }

    // Add reply to doubt
    //# Push that create reply obj
    doubt.replies.push(reply);

    // Update doubt status
    //# If dobut status open and replay is given by instructor (or admin/superAdmin)
    //  - mark the dobut status as 'answered'
    if (doubt.status === "open" && reply.isInstructorReply) {
      doubt.status = "answered";
    }
    // save doubt in database
    await doubt.save();
    // Send email by non-blocking mechanism (only log error, if there any error occur)
    // Non-blocking: email failure must not break the reply response
    sendReplyNotification(doubt, reply, req.user).catch((err) =>
      console.error("[addReply] Email notification failed:", err.message),
    );
    //# Send return reponse
    //  - message "reply posted successfully
    //  - dobut data,
    res.status(201).json({
      success: true,
      message: "Reply posted successfully",
      data: doubt,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
```

# Grade submission

```js
exports.gradeSubmission = async (req, res) => {
  try {
    //1. Extract id (of submission) form url
    const { id } = req.params;
    //2. Extract marksObtained (int), feeback (str), rubricScores (obj) from req.body
    const { marksObtained, feedback, rubricScores } = req.body;
    //3. Find the submission by provided id
    //    - populate assignment with maxmarks passignMarks rubric weightage
    //    - populate student with name and email
    const submission = await Submission.findById(id)
      .populate("assignment", "maxMarks passingMarks rubric weightage")
      .populate("student", "name email");
    //4. If there is no submission
    //  - return success to false
    //  - message "submission not found"
    if (!submission) {
      return res.status(404).json({
        success: false,
        message: "Submission not found",
      });
    }

    // Check authorization
    //5. Find the assignment by submisson.assignment(id)
    //6. From assignment id find batch(id)
    const assignment = await Assignment.findById(submission.assignment);
    const batch = await Batch.findById(assignment.batch);

    //7. If batch batch instructor id is not equal and user (login) role is not admin or superAdmin
    //  - return forbidden status with message not authorize to access
    if (
      batch.instructor.toString() !== req.user.id &&
      req.user.role !== "admin" &&
      req.user.role !== "superAdmin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to grade this submission",
      });
    }

    // Validate marks
    //8. If provided marks is greater than assignment max-marks
    //    - return bad request (status) with message marks cannot exceed max marks
    if (marksObtained > assignment.maxMarks) {
      return res.status(400).json({
        success: false,
        message: `Marks cannot exceed maximum marks (${assignment.maxMarks})`,
      });
    }

    // Update submission
    //9. Attach marks obtained, feedback, rubricScores, isGrade to true, gradeAt (today), submission gradeBy (login user), status to graded
    submission.marksObtained = marksObtained;
    submission.feedback = feedback;
    submission.rubricScores = rubricScores || [];
    submission.isGraded = true;
    submission.gradedAt = new Date();
    submission.gradedBy = req.user.id;
    submission.status = "graded";

    // Calculate percentage and grade
    //10. Calculate grade (A,B,C,D)
    submission.calculateGrade(assignment);
    //11. Save submission
    await submission.save();

    // Update grade record
    await updateGradeRecord(submission, assignment);

    // Non-blocking: email failure must not break the grade response
    sendGradeNotification(submission).catch((err) =>
      console.error("[gradeSubmission] Email notification failed:", err.message),
    );

    res.status(200).json({
      success: true,
      message: "Submission graded successfully",
      data: submission,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
```

# Update grade

```js
async function updateGradeRecord(submission, assignment) {
  try {
    //1. Find the grade by provided (submission, batch)
    let grade = await Grade.findOne({
      student: submission.student,
      batch: submission.batch,
    });
    //2. If grade not found
    // - student(id), batch(id), course(id), assignments completed or assignmentsCompletion
    if (!grade) {
      grade = await Grade.create({
        student: submission.student,
        batch: submission.batch,
        course: submission.course,
        assignmentsTotal: 0,
        assignmentsCompleted: 0,
      });
    }

    // Update assignment grades
    //3. Find the assignment grade index
    const assignmentGradeIndex = grade.assignmentGrades.findIndex(
      (ag) => ag.assignment.toString() === submission.assignment.toString(),
    );
    //4. If assignmentGrade (assignmentId, submission, socre, maxScore, percentage, grade, wightage, weightedScore -- if there assignment weightage the - (submission percentage)) 
    const assignmentGrade = {
      assignment: submission.assignment,
      submission: submission._id,
      score: submission.marksObtained,
      maxScore: assignment.maxMarks,
      percentage: submission.percentage,
      grade: submission.grade,
      weightage: assignment.weightage || 0,
      weightedScore: assignment.weightage
        ? (submission.percentage * assignment.weightage) / 100
        : 0,
      submittedAt: submission.submittedAt,
      gradedAt: submission.gradedAt,
    };

    if (assignmentGradeIndex === -1) {
      // Add new assignment grade
      grade.assignmentGrades.push(assignmentGrade);
      grade.assignmentsCompleted += 1;
    } else {
      // Update existing assignment grade
      grade.assignmentGrades[assignmentGradeIndex] = assignmentGrade;
    }

    // Update totals
    grade.totalScore = grade.assignmentGrades.reduce(
      (sum, ag) => sum + (ag.score || 0),
      0,
    );
    grade.totalMaxScore = grade.assignmentGrades.reduce(
      (sum, ag) => sum + (ag.maxScore || 0),
      0,
    );
    grade.assignmentsTotal = await Assignment.countDocuments({
      batch: submission.batch,
      isPublished: true,
    });

    // Calculate overall grade
    grade.calculateOverallGrade();

    await grade.save();
  } catch (error) {
    console.error("Error updating grade record:", error);
  }
}
```
## Upload to directly cloudinary 

```js
// Configure Cloudinary storage for student submission files
const submissionFilesStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: process.env.CLOUDINARY_SUBMISSIONS_FOLDER || 'zatAcademy/submissions',
    allowed_formats: [
      'pdf', 'doc', 'docx', 'ppt', 'pptx', 'txt', 'zip',
      'jpg', 'jpeg', 'png', 'gif', 'mp4', 'mov',
    ],
    resource_type: 'auto',
  },
});

const uploadSubmissionFiles = multer({
  storage: submissionFilesStorage,
  fileFilter: sessionMaterialsFilter, // reuse existing file-type filter
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
});

// Export new middleware
exports.uploadDoubtAttachments = uploadDoubtAttachment.array('attachments', 5); // Max 5 files
exports.uploadSubmissionFiles = uploadSubmissionFiles.array('files', 5); // Max 5 files per submission
```

```js
exports.downloadMaterial = async (req, res) => {
  try {
    //1. Extract learning material id form url
    const material = await LearningMaterial.findById(req.params.id);
    //2. If there no material found
    if (!material) {
      //  - return (not found error) with message 'Learning material not found'
      return res.status(404).json({ success: false, message: 'Learning material not found' });
    }

    // Must have a stored file to download
    //3. If there is no file to document or no file url 
    if (!material.file || !material.file.url) {
      // If it's an external URL redirect to it
      // -- if document has external url
      if (material.externalUrl) {
        // -- redirect user to that external url
        return res.redirect(material.externalUrl);
      }
      //4. Return message 'This material does no have downloadable file attached'
      return res.status(400).json({
        success: false,
        message: 'This material has no downloadable file attached',
      });
    }
    //5. Extract public id, mimeType and originalName out of material file 
    const { public_id, mimeType, originalName } = material.file;

    // If public_id exists we can build a proper signed Cloudinary URL
    let downloadUrl;
    if (public_id) {
      const resourceType = mimeToResourceType(mimeType);
      downloadUrl = buildCloudinaryUrl(public_id, resourceType, true, originalName);
    } else {
      // Fallback: use the plain stored URL (won't force download, but still works)
      downloadUrl = material.file.url;
    }

    return res.status(200).json({
      success: true,
      data: {
        url: downloadUrl,
        filename: originalName || material.title,
        mimeType: mimeType || 'application/octet-stream',
        size: material.file.size,
        expiresIn: 3600, // seconds
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
```

```js
exports.downloadSubmissionFile = async (req, res) => {
  try {
    //1. Extract submissionId and fileIndex form url
    const { submissionId, fileIndex } = req.params
    //2. Convert the fileIndex to number
    const idx = parseInt(fileIndex, 10);
    //3. Find the file submission 
    const submission = await Submission.findById(submissionId);
    //4. If it is present
    //    - return (not found error) with message "Submission not found"
    if (!submission) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }

    // Authorisation
    //5. 
    const allowed = await authoriseFileAccess(submission, req.user);
    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this submission file',
      });
    }
    //6. If submission does have file attach or submission files length is zero
    //  - return "The submission has no files"
    if (!submission.files || submission.files.length === 0) {
      return res.status(400).json({ success: false, message: 'This submission has no files' });
    }
    //7. If idx is not number or idx is less than zero or idx is greater than files attach length
    // - return message" file index is out of range"
    if (isNaN(idx) || idx < 0 || idx >= submission.files.length) {
      return res.status(400).json({
        success: false,
        message: `File index ${fileIndex} is out of range (0–${submission.files.length - 1})`,
      });
    }
    //8. Search for submission files by index
    const file = submission.files[idx];
    let downloadUrl;

    if (file.public_id) {
      const resourceType = mimeToResourceType(file.mimeType);
      downloadUrl = buildCloudinaryUrl(file.public_id, resourceType, true, file.originalName);
    } else {
      downloadUrl = file.url; // fallback
    }

    return res.status(200).json({
      success: true,
      data: {
        url: downloadUrl,
        filename: file.originalName || `file_${idx}`,
        mimeType: file.mimeType || 'application/octet-stream',
        size: file.size,
        expiresIn: 3600,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
```


```js
exports.previewSubmissionFile = async (req, res) => {
  try {
    //1. Extract submissionId and fileIndex form 
    const { submissionId, fileIndex } = req.params;
    const idx = parseInt(fileIndex, 10);

    const submission = await Submission.findById(submissionId);
    if (!submission) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }

    const allowed = await authoriseFileAccess(submission, req.user);
    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this submission file',
      });
    }

    if (!submission.files || submission.files.length === 0) {
      return res.status(400).json({ success: false, message: 'This submission has no files' });
    }
    if (isNaN(idx) || idx < 0 || idx >= submission.files.length) {
      return res.status(400).json({
        success: false,
        message: `File index ${fileIndex} is out of range (0–${submission.files.length - 1})`,
      });
    }

    const file = submission.files[idx];
    let previewUrl;

    if (file.public_id) {
      const resourceType = mimeToResourceType(file.mimeType);
      previewUrl = buildCloudinaryUrl(file.public_id, resourceType, false, null);
    } else {
      previewUrl = file.url;
    }

    return res.status(200).json({
      success: true,
      data: {
        url: previewUrl,
        filename: file.originalName || `file_${idx}`,
        mimeType: file.mimeType || 'application/octet-stream',
        expiresIn: 3600,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
```