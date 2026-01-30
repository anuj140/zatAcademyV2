const express = require("express");
const router = express.Router();
const {
  createUser,
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  activateUser,
} = require("../controllers/user.controller");
const { protect } = require("../middleware/auth");
const { authorize } = require("../middleware/role");

// All user routes require authentication and admin role
router.use(protect);
router.use(authorize("admin", "superAdmin"));

router.route("/").post(createUser).get(getUsers);

router.route("/:id").get(getUser).put(updateUser).delete(deleteUser);

router.put("/:id/activate", activateUser);

module.exports = router;
