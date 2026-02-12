const mongoose = require("mongoose");

const scheduleSchema = new mongoose.Schema({
  day: {
    type: String,
    enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
    required: true,
  },
  startTime: {
    type: String,
    required: true,
    match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, // HH:MM format
  },
  endTime: {
    type: String,
    required: true,
    match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
  },
});

const batchSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Please provide batch name"],
    trim: true,
    maxlength: [50, "Batch name cannot exceed 50 characters"],
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course",
    required: true,
  },
  startDate: {
    type: Date,
    required: [true, "Please provide batch start date"],
    validate: {
      validator: function (value) {
        // 1. Get the update object from Mongoose
        const update = this.getUpdate ? this.getUpdate() : null;
        console.log("update: ", update);
        console.log("this.getUpdate: ", this.getUpdate);

        // 2. Check if a new startDate is being provided in this update
        const startDate = update && update.startDate ? update.startDate : this.startDate;
        console.log("startDate: ", startDate);
        console.log("this.startDate: ", this.startDate);
        console.log("update.startDate: ", this.startDate);

        // 3. Perform the comparison
        if (!startDate) return true; // Skip if we can't find a start date to compare
        return value > new Date();
      },
      message: "Start date must be in the future",
    },
  },
  endDate: {
    type: Date,
    required: [true, "Please provide batch end date"],
    validate: {
      validator: function (value) {
        return value > this.startDate;
      },
      message: "End date must be after start date",
    },
  },
  schedule: [scheduleSchema],
  instructor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    validate: {
      validator: async function (value) {
        const User = mongoose.model("User");
        const user = await User.findById(value);
        return user && user.role === "instructor";
      },
      message: "Assigned user must be an instructor",
    },
  },
  maxStudents: {
    type: Number,
    required: [true, "Please provide maximum number of students"],
    min: [1, "Maximum students must be at least 1"],
    default: 50,
  },
  currentStudents: {
    type: Number,
    default: 0,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  isFull: {
    type: Boolean,
    default: false,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update timestamp and check if batch is full
batchSchema.pre("findOneAndUpdate", async function (next) {
  this.set({ updatedAt: Date.now() });

  const update = this.getUpdate();
  if (update.currentStudents !== undefined) {
    const batch = await this.model.findOne(this.getQuery());
    if (batch && update.currentStudents >= batch.maxStudents) {
      this.set({ isFull: true });
    } else {
      this.set({ isFull: false });
    }
  }
});

// Virtual for checking if batch has started
batchSchema.virtual("hasStarted").get(function () {
  return this.startDate <= new Date();
});

// Virtual for checking if batch has ended
batchSchema.virtual("hasEnded").get(function () {
  return this.endDate <= new Date();
});

module.exports = mongoose.model("Batch", batchSchema);
