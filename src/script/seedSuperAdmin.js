require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const seedSuperAdmin = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB for seeding...');
    
    // Check if super admin already exists
    const existingSuperAdmin = await User.findOne({ role: 'superAdmin' });
    
    if (existingSuperAdmin) {
      console.log('Super Admin already exists. Skipping seeding.');
      process.exit(0);
    }
    
    // Create super admin
    const superAdmin = await User.create({
      name: process.env.SUPER_ADMIN_NAME || 'System Super Admin',
      email: process.env.SUPER_ADMIN_EMAIL,
      password: process.env.SUPER_ADMIN_PASSWORD,
      role: 'superAdmin',
      emailVerified: true,
      isActive: true
    });
    
    console.log('✅ Super Admin created successfully:');
    console.log(`   Name: ${superAdmin.name}`);
    console.log(`   Email: ${superAdmin.email}`);
    console.log(`   Role: ${superAdmin.role}`);
    console.log('\n⚠️  IMPORTANT: Change the default password immediately!');
    
    process.exit(0);
  } catch (error) {
    console.error('Error seeding super admin:', error);
    process.exit(1);
  }
};

// Run the seed script
seedSuperAdmin();