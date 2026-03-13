const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });

const AnalyticsCalculator = require('../src/utils/analyticsCalculator');
const User = require('../src/models/User');
const Enrollment = require('../src/models/Enrollment');
const Batch = require('../src/models/Batch');
const Course = require('../src/models/Course');

async function verify() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected!');

    console.log('\n--- Verifying getSystemAnalytics ---');
    const systemAnalytics = await AnalyticsCalculator.getSystemAnalytics('30d');
    console.log('System Analytics Overview:', JSON.stringify(systemAnalytics.overview, null, 2));
    
    if (systemAnalytics.overview.feesCompleted !== undefined && systemAnalytics.overview.outstandingFees !== undefined) {
      console.log('✅ New metrics (feesCompleted, outstandingFees) are present.');
    } else {
      console.log('❌ New metrics are MISSING.');
    }

    console.log('\n--- Verifying getEnrolledStudents ---');
    const students = await AnalyticsCalculator.getEnrolledStudents();
    console.log(`Found ${students.length} enrolled students.`);
    if (students.length > 0) {
      console.log('Sample student:', JSON.stringify(students[0], null, 2));
      console.log('✅ Student list retrieval works.');
    } else {
      console.log('No students found (might be expected in a clean DB).');
    }

    console.log('\n--- Verifying getEnrolledStudents with Batch Filter ---');
    const batches = await Batch.find().limit(1);
    if (batches.length > 0) {
      const filteredStudents = await AnalyticsCalculator.getEnrolledStudents({ batchId: batches[0]._id });
      console.log(`Found ${filteredStudents.length} students for batch ${batches[0].name}.`);
      console.log('✅ Batch filtering works.');
    }

    process.exit(0);
  } catch (error) {
    console.error('Verification failed:', error);
    process.exit(1);
  }
}

verify();
