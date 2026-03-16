/**
 * Seed script — upserts all 12 system default email templates to MongoDB.
 * Run once: node src/script/seedEmailTemplates.js
 */

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
  await mongoose.connect(process.env.MONGODB_URI);
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
