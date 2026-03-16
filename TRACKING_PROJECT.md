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
    if (isActive !== undefined) filter.isActive = isActive === 'true'; ///??
    //5. Find the documents based on whatever save in filter object
    // - exclude htmlBody, sort by - category slug, 
    // - populate createdBy, updatedBy - name, email
    const templates = await EmailTemplate.find(filter)
      .select('-htmlBody')           // exclude body in list view for brevity
      .sort('category slug')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

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
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');
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
          source: 'default',
          data: {
            slug: req.params.slug,
            subject: defaultTpl.subject,
            htmlBody: defaultTpl.htmlBody,
            isActive: true,
          },
        });
      }
      //2.4. If no default template found return message "Template not found"
      return res.status(404).json({ success: false, message: 'Template not found' });
    }
    //4. Return (status ok) mentioed source database, actual  template 
    res.status(200).json({ success: true, source: 'database', data: template });
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
      return { subject: '', html: '' };
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
    return { subject: '', html: '' };
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
    console.log('Email sent successfully');
  } catch (error) {
    //4. Otherwise log error send method
    //5. Throw custom error "email could not be sent"
    console.error('Error sending email:', error);
    throw new Error('Email could not be sent');
  }
};
```

```js
// sendPasswordResetEmail take user and resetToken
const sendPasswordResetEmail = async (user, resetToken) => {
  //1. Construct the url for resetToken by attaching resetToken 
  const resetURL = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

  //2. Pass user name and resetUrl in renderTemplate fn (which replace placeholder with actual value) and then extract replace holder content 'subject and body'
  const { subject, html } = await renderTemplate('password_reset', {
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
    const allowedFields = ['name', 'subject', 'htmlBody', 'variables', 'category', 'isActive'];
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
      { new: true, runValidators: true }
    );
    //5. If template not found 
    //    - return (status not found) with message 'template not found'
    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }
    //6. If found (status ok) with message 'template updated successfully' and return the updated template
    res.status(200).json({ success: true, message: 'Template updated successfully', data: template });
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
    const { interpolate } = require('../utils/templateService');

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
        return res.status(404).json({ success: false, message: 'Template not found' });
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
    const dbSlugs = await EmailTemplate.distinct('slug');
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
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const EmailTemplate = require('../models/EmailTemplate');
const { DEFAULTS } = require('../utils/templateService');

const TEMPLATE_META = {
  enrollment_initiated: {
    name: 'Enrollment Initiated',
    category: 'enrollment',
    variables: ['userName', 'courseTitle', 'batchName', 'totalAmount', 'paymentMethodLabel', 'firstPaymentAmount'],
  },
  payment_success: {
    name: 'Payment Successful',
    category: 'payment',
    variables: ['userName', 'amount', 'courseTitle', 'isFullyPaid', 'paidAmount', 'totalAmount', 'dashboardUrl'],
  },
  password_reset: {
    name: 'Password Reset',
    category: 'auth',
    variables: ['userName', 'resetURL'],
  },
  welcome: {
    name: 'Welcome Email',
    category: 'auth',
    variables: ['userName', 'tempPassword', 'loginUrl'],
  },
  assignment_graded: {
    name: 'Assignment Graded',
    category: 'grade',
    variables: ['userName', 'assignmentTitle', 'marksObtained', 'maxMarks', 'percentage', 'grade', 'passStatus', 'feedback', 'submissionUrl'],
  },
  final_grades_published: {
    name: 'Final Grades Published',
    category: 'grade',
    variables: ['userName', 'courseTitle', 'batchName', 'overallPercentage', 'finalGrade', 'assignmentsCompleted', 'assignmentsTotal', 'gradesUrl'],
  },
  assignment_created: {
    name: 'New Assignment Created',
    category: 'assignment',
    variables: ['userName', 'batchName', 'assignmentTitle', 'deadline', 'maxMarks', 'passingMarks', 'assignmentUrl'],
  },
  assignment_published: {
    name: 'Assignment Published',
    category: 'assignment',
    variables: ['userName', 'batchName', 'assignmentTitle', 'startDate', 'deadline', 'maxMarks', 'assignmentUrl'],
  },
  assignment_updated: {
    name: 'Assignment Updated',
    category: 'assignment',
    variables: ['userName', 'batchName', 'assignmentTitle', 'deadline', 'lateDeadline', 'assignmentUrl'],
  },
  doubt_created_instructor: {
    name: 'New Doubt Notification (Instructor)',
    category: 'doubt',
    variables: ['instructorName', 'batchName', 'doubtTitle', 'studentName', 'category', 'postedAt', 'doubtUrl'],
  },
  doubt_resolved_student: {
    name: 'Doubt Resolved (Student)',
    category: 'doubt',
    variables: ['userName', 'doubtTitle', 'resolvedAt', 'doubtUrl'],
  },
  doubt_reply_notification: {
    name: 'Doubt Reply Notification',
    category: 'doubt',
    variables: ['userName', 'doubtTitle', 'replyContext', 'repliedBy', 'doubtUrl'],
  },
};

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  let created = 0;
  let updated = 0;

  for (const [slug, defaultTpl] of Object.entries(DEFAULTS)) {
    const meta = TEMPLATE_META[slug] || { name: slug, category: 'other', variables: [] };

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
      { upsert: true, new: true, setDefaultsOnInsert: true }
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
  console.error('Seeder failed:', err);
  process.exit(1);
});

```