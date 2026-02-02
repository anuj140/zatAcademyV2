const mongoose = require("mongoose");

const liveSessionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Please provide session title"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    description: {
      type: String,
      maxlength: [1000, "Description cannot exceed 1000 characters"],
    },
    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Batch",
      required: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    instructor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    startTime: {
      type: Date,
      required: [true, "Please provide session start time"],
    },
    endTime: {
      type: Date,
      required: [true, "Please provide session end time"],
      validate: {
        validator: function (value) {
          return value > this.startTime;
        },
        message: "End time must be after start time",
      },
    },
    duration: {
      type: Number, // in minutes
      required: true,
      min: [15, "Minimum session duration is 15 minutes"],
      max: [480, "Maximum session duration is 8 hours"],
    },
    status: {
      type: String,
      enum: ["scheduled", "ongoing", "completed", "cancelled", "rescheduled"],
      default: "scheduled",
    },
    sessionType: {
      type: String,
      enum: ["lecture", "doubt", "workshop", "assignment_review", "other"],
      default: "lecture",
    },
    // Video Conferencing Details
    provider: {
      type: String,
      enum: ["inhouse", "zoom", "google_meet"],
      default: "inhouse",
    },
    meetingId: String,
    meetingPassword: String,
    joinUrl: String,
    startUrl: String, // For host/instructor
    recordingUrl: String,
    recordingPublicId: String, // For Cloudinary
    // In-house specific
    roomId: String,
    roomSecret: String,

    // Attendance tracking
    attendees: [
      {
        student: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        joinedAt: Date,
        leftAt: Date,
        duration: Number, // in minutes
      },
    ],

    // Materials
    hasMaterials: {
      type: Boolean,
      default: false,
    },
    materialsCount: {
      type: Number,
      default: 0,
    },

    // Cancellation/Rescheduling
    cancelledAt: Date,
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    cancellationReason: String,
    rescheduledFrom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LiveSession",
    },

    // Metadata
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
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Virtuals
liveSessionSchema.virtual("isUpcoming").get(function () {
  return this.startTime > new Date() && this.status === "scheduled";
});

liveSessionSchema.virtual("isOngoing").get(function () {
  const now = new Date();
  return now >= this.startTime && now <= this.endTime && this.status === "scheduled";
});

liveSessionSchema.virtual("isPast").get(function () {
  return this.endTime < new Date() || this.status === "completed";
});

liveSessionSchema.virtual("isCancelled").get(function () {
  return this.status === "cancelled";
});

// Indexes for performance
liveSessionSchema.index({ batch: 1, startTime: 1 });
liveSessionSchema.index({ instructor: 1, startTime: 1 });
liveSessionSchema.index({ startTime: 1, status: 1 });

// Update timestamp
liveSessionSchema.pre("findOneAndUpdate", async function () {
  this.set({ updatedAt: Date.now() });
});

// Automatically update status based on time
liveSessionSchema.pre("save", async function () {
  const now = new Date();

  if (this.status === "scheduled") {
    if (now >= this.startTime && now <= this.endTime) {
      this.status = "ongoing";
    } else if (now > this.endTime) {
      this.status = "completed";
    }
  }
});

module.exports = mongoose.model("LiveSession", liveSessionSchema);
