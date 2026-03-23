const express = require("express");
const {
  createBroadcast,
  getAllBroadcasts,
  getBroadcastById,
  updateBroadcast,
  deleteBroadcast,
} = require("../controllers/broadcast.controller");

const { protect } = require("../middleware/auth");
const { authorize } = require("../middleware/role");

const router = express.Router();

// All routes require authentication
router.use(protect);

router
  .route("/")
  .post(authorize("instructor", "admin", "superAdmin"), createBroadcast)
  .get(getAllBroadcasts);

router
  .route("/:id")
  .get(getBroadcastById)
  .patch(authorize("instructor", "admin", "superAdmin"), updateBroadcast)
  .delete(authorize("instructor", "admin", "superAdmin"), deleteBroadcast);

module.exports = router;
