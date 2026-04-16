require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./src/config/database');
const Assignment = require('./src/models/Assignment');
const Enrollment = require('./src/models/Enrollment');
const User = require('./src/models/User'); 

const assignmentId = '69809d96fe4b66d0ea9ca71a';

const findStudents = async () => {
  try {
    await connectDB();
    console.log(`\nSearching for students related to assignment: ${assignmentId}`);
    
    if (!mongoose.Types.ObjectId.isValid(assignmentId)) {
      console.error('Invalid Assignment ID format');
      process.exit(1);
    }
    
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) {
      console.log('Assignment not found in the database.');
      process.exit(0);
    }
    
    console.log(`Assignment "${assignment.title}" found.`);
    console.log(`Batch ID: ${assignment.batch}, Course ID: ${assignment.course}`);
    
    const enrollments = await Enrollment.find({
      $or: [
        { batch: assignment.batch },
        { course: assignment.course }
      ]
    }).populate('student', 'name email role');
    
    const students = enrollments.map(e => e.student).filter(s => s != null);
    
    console.log(`\nFound ${students.length} student(s) enrolled in the related batch or course:`);
    students.forEach((student, index) => {
      console.log(`${index + 1}. Name: ${student.name}, Email: ${student.email}, ID: ${student._id}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

findStudents();
