const express = require("express");
const {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} = require("../controllers/notification.controller");

const { protect, requirePhoneVerifiedForWrites } = require("../middleware/auth");

const router = express.Router();

// All notification routes require authentication
router.use(protect);
// Block unverified-phone users from writes (mark read, delete)
router.use(requirePhoneVerifiedForWrites);

router.route("/").get(getMyNotifications);

router.route("/unread-count").get(getUnreadCount);

router.route("/read-all").patch(markAllAsRead);

router
  .route("/:id/read")
  .patch(markAsRead);

router
  .route("/:id")
  .delete(deleteNotification);

module.exports = router;
